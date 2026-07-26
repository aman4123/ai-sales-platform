import { describe, expect, it, vi } from "vitest";
import { assignInitialAdmin } from "./admin.assignment.js";

function databaseFor(user: { id: string; emailVerifiedAt: Date | null; role: string } | null) {
  const findUnique = vi.fn().mockResolvedValue(user);
  const update = vi.fn().mockReturnValue({ operation: "promote" });
  const createAudit = vi.fn().mockReturnValue({ operation: "audit" });
  const transaction = vi.fn().mockResolvedValue([]);
  const database = {
    user: {
      findUnique,
      update,
    },
    auditLog: { create: createAudit },
    $transaction: transaction,
  };
  return { database: database as never, findUnique, update, createAudit, transaction };
}

describe("initial administrator assignment", () => {
  it("promotes only a verified existing user and writes the audit event atomically", async () => {
    const fixture = databaseFor({ id: "user-1", emailVerifiedAt: new Date(), role: "USER" });

    await expect(assignInitialAdmin(fixture.database, " Admin@Example.test ")).resolves.toMatchObject({ status: "admin-ready" });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { role: "ADMIN" } });
    expect(fixture.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "INITIAL_ADMIN_ASSIGNED", actorUserId: "user-1" }),
    }));
  });

  it("refuses missing and unverified accounts without writing", async () => {
    const missing = databaseFor(null);
    await expect(assignInitialAdmin(missing.database, "missing@example.test")).rejects.toThrow(/No existing user/);
    expect(missing.transaction).not.toHaveBeenCalled();

    const unverified = databaseFor({ id: "user-2", emailVerifiedAt: null, role: "USER" });
    await expect(assignInitialAdmin(unverified.database, "user@example.test")).rejects.toThrow(/verify their email/);
    expect(unverified.transaction).not.toHaveBeenCalled();
  });
});
