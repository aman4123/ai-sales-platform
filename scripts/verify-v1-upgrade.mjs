import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  assert,
  recreateDatabase,
  requireIsolatedDatabase,
  runPrisma,
  withDatabase,
} from "./database-test-utils.mjs";

const V1_COMMIT = "6fb8fe57da6087feef8ef3bdac1e45321818265e";
const v1Migrations = [
  "20260723100000_initial_schema",
  "20260723154500_harden_defaults_and_lead_search",
  "20260723190000_account_lifecycle",
  "20260724130000_replace_deepseek_with_groq",
];
const target = requireIsolatedDatabase("UPGRADE_MIGRATION_DATABASE_URL");
await recreateDatabase(target);

await withDatabase(target.raw, async (database) => {
  await database.query(`
    CREATE TABLE "_prisma_migrations" (
      id VARCHAR(36) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  for (const migrationName of v1Migrations) {
    const relativePath = `prisma/migrations/${migrationName}/migration.sql`;
    const committedSql = execFileSync("git", ["show", `${V1_COMMIT}:${relativePath}`], { encoding: "utf8" });
    const workingSql = readFileSync(path.resolve(relativePath), "utf8");
    assert(committedSql === workingSql, `${relativePath} differs from the verified V1 commit.`);
    await database.query(committedSql);
    await database.query(
      `INSERT INTO "_prisma_migrations"
       (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, now(), 1)`,
      [randomUUID(), createHash("sha256").update(committedSql).digest("hex"), migrationName],
    );
  }

  const passwordHash = bcrypt.hashSync("V1-upgrade-test-password!", 4);
  await database.query(
    `INSERT INTO "User" (id,email,"passwordHash",name,role,"emailVerifiedAt","passwordChangedAt","createdAt","updatedAt") VALUES
      ('v1-user-admin','v1-admin@example.test',$1,'V1 Admin','ADMIN',now(),now(),now(),now()),
      ('v1-user-member','v1-member@example.test',$1,'V1 Member','MEMBER',now(),now(),now(),now())`,
    [passwordHash],
  );
  await database.query(
    `INSERT INTO "RefreshSession" (id,"tokenHash","userId","userAgent","ipAddress","expiresAt","createdAt") VALUES
      ('v1-session-admin','session-admin-test-hash','v1-user-admin','upgrade-test','127.0.0.1',now()+interval '1 day',now()),
      ('v1-session-member','session-member-test-hash','v1-user-member','upgrade-test','127.0.0.1',now()+interval '1 day',now())`,
  );
  await database.query(
    `INSERT INTO "Lead" (id,company,contact,email,phone,industry,status,value,notes,"userId","createdAt","updatedAt") VALUES
      ('v1-lead-admin','Legacy Logistics','Alex Admin','alex.admin@example.test',NULL,'Logistics','INTERESTED',12500,'Preserve admin lead','v1-user-admin',now(),now()),
      ('v1-lead-member','Legacy Manufacturing','Morgan Member','morgan.member@example.test','+10000000000','Manufacturing','FOLLOW_UP',8800,'Preserve member lead','v1-user-member',now(),now())`,
  );
  await database.query(
    `INSERT INTO "UserSettings" (id,"userId",company,signature,"aiProvider",theme,notifications,"createdAt","updatedAt") VALUES
      ('v1-settings-admin','v1-user-admin','Legacy Admin Co','Regards, Admin','GROQ','DARK',true,now(),now()),
      ('v1-settings-member','v1-user-member','Legacy Member Co','Regards, Member','MOCK','LIGHT',false,now(),now())`,
  );
  await database.query(
    `INSERT INTO "AiRequest" (id,type,prompt,response,provider,"userId","createdAt") VALUES
      ('v1-research-request','RESEARCH','Legacy research prompt','Legacy research response','GROQ','v1-user-admin',now()),
      ('v1-email-request','EMAIL','Legacy email prompt','Legacy email response','MOCK','v1-user-member',now())`,
  );
  await database.query(
    `INSERT INTO "AccountToken" (id,"tokenHash",type,"userId","expiresAt","createdAt") VALUES
      ('v1-account-token','account-token-test-hash','PASSWORD_RESET','v1-user-member',now()+interval '1 hour',now())`,
  );
  await database.query(
    `INSERT INTO "RecoveryCode" (id,"codeHash","userId","createdAt") VALUES
      ('v1-recovery-code','recovery-code-test-hash','v1-user-admin',now())`,
  );
});

const before = await withDatabase(target.raw, collectState);
runPrisma(["migrate", "deploy"], target.raw);
runPrisma(["migrate", "status"], target.raw);
const after = await withDatabase(target.raw, collectState);

assert(JSON.stringify(before.counts) === JSON.stringify(after.counts), "V1 row counts changed during upgrade.");
assert(JSON.stringify(before.users) === JSON.stringify(after.users), "V1 user identity, role, or password data changed.");
assert(JSON.stringify(before.leads) === JSON.stringify(after.leads), "V1 lead ownership or values changed.");
assert(JSON.stringify(before.settings) === JSON.stringify(after.settings), "V1 settings changed during upgrade.");
assert(after.migrationCount >= 7, "The V2 migrations were not applied.");
assert(await bcrypt.compare("V1-upgrade-test-password!", after.passwordHash), "The legacy password hash is no longer valid.");
assert(after.v2TableCount >= 11, "Expected V2 tables are missing after upgrade.");
assert(after.defaultRole === "USER", "New users do not default to USER after upgrade.");

process.stdout.write(`${JSON.stringify({
  status: "v1-upgrade-pass",
  database: target.databaseName,
  before: before.counts,
  after: after.counts,
  users: after.users,
  v2TableCount: after.v2TableCount,
  migrationCount: after.migrationCount,
})}\n`);

async function collectState(database) {
  const counts = {};
  for (const table of ["User", "RefreshSession", "Lead", "UserSettings", "AiRequest", "AccountToken", "RecoveryCode"]) {
    const result = await database.query(`SELECT count(*)::int AS count FROM "${table}"`);
    counts[table] = result.rows[0].count;
  }
  const users = (await database.query('SELECT id,email,role FROM "User" ORDER BY id')).rows;
  const leads = (await database.query('SELECT id,company,contact,email,phone,industry,status,value::text,notes,"userId" FROM "Lead" ORDER BY id')).rows;
  const settings = (await database.query('SELECT "userId",company,signature,"aiProvider",theme,notifications FROM "UserSettings" ORDER BY "userId"')).rows;
  const passwordHash = (await database.query('SELECT "passwordHash" FROM "User" WHERE id=$1', ["v1-user-member"])).rows[0].passwordHash;
  const migrationCount = (await database.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].count;
  const v2TableCount = (await database.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])", [["Company", "Contact", "Deal", "ResearchJob", "EvidenceItem", "Campaign", "CampaignApproval", "OptOut", "AuditLog", "Task", "SearchUsage"]])).rows[0].count;
  const defaultRole = (await database.query("SELECT replace(split_part(column_default, '::', 1), '''', '') AS role FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='role'")).rows[0].role;
  return { counts, users, leads, settings, passwordHash, migrationCount, v2TableCount, defaultRole };
}
