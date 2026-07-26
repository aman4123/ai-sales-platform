import {
  assert,
  recreateDatabase,
  requireIsolatedDatabase,
  runPrisma,
  withDatabase,
} from "./database-test-utils.mjs";

const target = requireIsolatedDatabase("CLEAN_MIGRATION_DATABASE_URL");
await recreateDatabase(target);
runPrisma(["migrate", "deploy"], target.raw);
runPrisma(["migrate", "status"], target.raw);

const verification = await withDatabase(target.raw, async (database) => {
  const migrations = await database.query(
    'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at',
  );
  assert(migrations.rows.length >= 7, "The complete migration chain was not applied.");
  assert(
    migrations.rows.every((row) => row.finished_at && !row.rolled_back_at),
    "A migration is unfinished or rolled back.",
  );

  const requiredTables = [
    "AuditLog", "Campaign", "CampaignApproval", "CampaignMessage", "CampaignRecipient",
    "Company", "CompanyResearchResult", "Contact", "Deal", "DeliveryEvent", "EvidenceItem",
    "OptOut", "ResearchJob", "SearchUsage", "Task", "User",
  ];
  const tables = await database.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
    [requiredTables],
  );
  assert(tables.rows.length === requiredTables.length, "One or more required V2 tables are missing.");

  const roleDefault = await database.query(
    "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='role'",
  );
  assert(roleDefault.rows[0]?.column_default === `'USER'::"UserRole"`, "New users do not default to USER.");

  const foreignKeys = await database.query(
    "SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f'",
  );
  assert(foreignKeys.rows[0].count >= 50, "Expected V2 foreign keys are missing.");

  const nullableUnknowns = await database.query(
    "SELECT bool_and(is_nullable='YES') AS nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='CompanyResearchResult' AND column_name = ANY($1::text[])",
    [["companyName", "website", "industry", "headquarters", "publicPhone", "publicEmail"]],
  );
  assert(nullableUnknowns.rows[0].nullable === true, "Unknown research fields must remain nullable.");

  const requiredConstraints = [
    "Lead_score_range_check",
    "EvidenceItem_confidence_range_check",
    "CampaignRecipient_target_required_check",
    "CampaignMessage_attempt_bounds_check",
    "Contact_public_data_source_check",
  ];
  const constraints = await database.query(
    "SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])",
    [requiredConstraints],
  );
  assert(constraints.rows.length === requiredConstraints.length, "Release-critical check constraints are missing.");
  const approvalTrigger = await database.query(
    `SELECT tgenabled FROM pg_trigger
     WHERE tgrelid='"CampaignApproval"'::regclass
       AND tgname='CampaignApproval_immutable_update'
       AND NOT tgisinternal`,
  );
  assert(approvalTrigger.rows[0]?.tgenabled === "O", "Campaign approval immutability trigger is missing or disabled.");

  await database.query("BEGIN");
  try {
    await database.query(`INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES ('constraint-user','constraint@example.test','test-hash','Constraint Probe',now())`);
    await database.query(`INSERT INTO "Campaign" (id,"userId",name,"salesGoal","productService","valueProposition","audienceFilters","senderIdentity","sequenceConfig",schedule,"updatedAt") VALUES ('constraint-campaign','constraint-user','Constraint Probe','Probe','Probe','Probe','{}','{}','{}','{}',now())`);
    await database.query(`INSERT INTO "CampaignApproval" (id,"campaignId","approvedById","approvalType","contentVersion","recipientCount","messageSnapshot","sequenceSnapshot","limitsSnapshot") VALUES ('constraint-approval','constraint-campaign','constraint-user','INITIAL_ONLY',1,1,'[]','{}','{}')`);

    await database.query("SAVEPOINT approval_immutability");
    let approvalImmutable = false;
    try {
      await database.query(`UPDATE "CampaignApproval" SET "recipientCount"=2 WHERE id='constraint-approval'`);
    } catch (error) {
      approvalImmutable = error?.code === "P0001";
      await database.query("ROLLBACK TO SAVEPOINT approval_immutability");
    }
    assert(approvalImmutable, "Campaign approval rows can be updated.");

    await database.query("SAVEPOINT lead_range");
    let leadRangeEnforced = false;
    try {
      await database.query(`INSERT INTO "Lead" (id,company,contact,"userId",score,"updatedAt") VALUES ('constraint-lead','Probe','Probe','constraint-user',101,now())`);
    } catch (error) {
      leadRangeEnforced = error?.code === "23514";
      await database.query("ROLLBACK TO SAVEPOINT lead_range");
    }
    assert(leadRangeEnforced, "Lead score range is not enforced by PostgreSQL.");

    await database.query("SAVEPOINT contact_source");
    let contactSourceEnforced = false;
    try {
      await database.query(`INSERT INTO "Contact" (id,"userId",name,"publicEmail","updatedAt") VALUES ('constraint-contact','constraint-user','Probe','probe@example.test',now())`);
    } catch (error) {
      contactSourceEnforced = error?.code === "23514";
      await database.query("ROLLBACK TO SAVEPOINT contact_source");
    }
    assert(contactSourceEnforced, "Public contact source attribution is not enforced by PostgreSQL.");
  } finally {
    await database.query("ROLLBACK");
  }

  return {
    database: target.databaseName,
    migrations: migrations.rows.map((row) => row.migration_name),
    requiredTables: tables.rows.length,
    foreignKeys: foreignKeys.rows[0].count,
    enforcedConstraints: requiredConstraints.length + 1,
    roleDefault: "USER",
  };
});

process.stdout.write(`${JSON.stringify({ status: "clean-migration-pass", ...verification })}\n`);
