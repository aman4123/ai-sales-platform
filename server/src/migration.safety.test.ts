import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("V2 migration safety", () => {
  it("is additive and contains no destructive table or column operations", () => {
    const migrationDirectories = readdirSync(path.resolve("prisma/migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name >= "20260726173000")
      .map((entry) => entry.name);
    const migrations = migrationDirectories.map((name) =>
      readFileSync(path.resolve("prisma/migrations", name, "migration.sql"), "utf8"),
    );
    for (const migration of migrations) {
      expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN|TYPE|SCHEMA)\b/i);
      expect(migration).not.toMatch(/\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
    }
    const migration = migrations.join("\n");
    for (const table of ["ResearchJob", "EvidenceItem", "Campaign", "CampaignApproval", "OptOut", "AuditLog"]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("makes approval snapshots immutable and enforces release-critical bounds", () => {
    const migration = readFileSync(path.resolve("prisma/migrations/20260726190000_release_candidate_constraints/migration.sql"), "utf8");
    expect(migration).toContain('CREATE TRIGGER "CampaignApproval_immutable_update"');
    expect(migration).toContain('CampaignRecipient_target_required_check');
    expect(migration).toContain('Contact_public_data_source_check');
    expect(migration).toContain('CampaignMessage_attempt_bounds_check');
  });

  it("changes the registration default only in the follow-up migration", () => {
    const first = readFileSync(path.resolve("prisma/migrations/20260726173000_v2_human_approved_sales_os/migration.sql"), "utf8");
    const second = readFileSync(path.resolve("prisma/migrations/20260726173100_default_user_role/migration.sql"), "utf8");
    expect(first).not.toMatch(/SET DEFAULT 'USER'/);
    expect(second).toContain("SET DEFAULT 'USER'");
  });
});
