import { describe, expect, it, vi } from "vitest";
import { ensureInitialMasterAccount } from "./admin.assignment.js";

function databaseFor(user: { id: string; emailVerifiedAt: Date | null; role: string } | null) {
  const findUnique = vi.fn().mockResolvedValue(user);
  const update = vi.fn().mockReturnValue({ operation: "promote" });
  const createUser = vi.fn().mockResolvedValue({ id: "master-1" });
  const createAudit = vi.fn().mockResolvedValue({ id: "audit-1" });
  const database = {
    user: { findUnique, update, create: createUser },
    auditLog: { create: createAudit },
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(async (operation: unknown) => {
    if (Array.isArray(operation)) return operation;
    return (operation as (transaction: typeof database) => unknown)(database);
  });
  return { database: database as never, findUnique, update, createUser, createAudit, transaction: database.$transaction };
}

describe("initial Master Admin assignment", () => {
  it("promotes an existing account to permanent Master Admin and audits the change", async () => {
    const fixture = databaseFor({ id: "user-1", emailVerifiedAt: new Date(), role: "USER" });

    await expect(ensureInitialMasterAccount(fixture.database, " Admin@Example.test ")).resolves.toMatchObject({
      status: "master-ready",
      created: false,
      accountId: "user-1",
    });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { role: "SUPER_ADMIN" } });
    expect(fixture.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "INITIAL_MASTER_ADMIN_ASSIGNED", actorUserId: "user-1" }),
    }));
  });

  it("locks and verifies an unverified account before promoting it", async () => {
    const fixture = databaseFor({ id: "user-1", emailVerifiedAt: null, role: "USER" });

    await expect(ensureInitialMasterAccount(fixture.database, "master@example.test")).resolves.toMatchObject({
      status: "master-ready",
      created: false,
      accountId: "user-1",
    });
    expect(fixture.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        emailVerifiedAt: expect.any(Date),
        passwordHash: expect.any(String),
        role: "SUPER_ADMIN",
      },
    });
    expect(fixture.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "INITIAL_MASTER_ADMIN_ASSIGNED",
        metadata: { method: "INITIAL_ADMIN_EMAIL", passwordResetRequired: true },
      }),
    }));
  });

  it("creates a locked Master Admin account that requires an email password reset", async () => {
    const fixture = databaseFor(null);

    await expect(ensureInitialMasterAccount(fixture.database, "master@example.test")).resolves.toMatchObject({
      status: "master-ready",
      created: true,
      accountId: "master-1",
    });
    expect(fixture.createUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "master@example.test",
        emailVerifiedAt: expect.any(Date),
        name: "Master Tester",
        passwordHash: expect.any(String),
        role: "SUPER_ADMIN",
        settings: { create: {} },
      }),
      select: { id: true },
    });
    expect(fixture.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "INITIAL_MASTER_ACCOUNT_CREATED", actorUserId: "master-1" }),
    }));
  });

  it("is idempotent for an existing Master Admin", async () => {
    const fixture = databaseFor({ id: "master-1", emailVerifiedAt: new Date(), role: "SUPER_ADMIN" });
    await expect(ensureInitialMasterAccount(fixture.database, "master@example.test")).resolves.toMatchObject({ created: false });
    expect(fixture.transaction).not.toHaveBeenCalled();
  });
});
