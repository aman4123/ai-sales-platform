import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";

function normalizedEmail(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INITIAL_ADMIN_EMAIL must be a valid email address.");
  }
  return email;
}

export async function ensureInitialMasterAccount(database: DatabaseClient, rawEmail: string) {
  const email = normalizedEmail(rawEmail);
  const user = await database.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true, role: true },
  });

  if (!user) {
    const passwordHash = await hash(randomBytes(48).toString("base64url"), env.BCRYPT_ROUNDS);
    try {
      const created = await database.$transaction(async (transaction) => {
        const account = await transaction.user.create({
          data: {
            email,
            emailVerifiedAt: new Date(),
            passwordHash,
            name: "Master Tester",
            role: "SUPER_ADMIN",
            settings: { create: {} },
          },
          select: { id: true },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: account.id,
            action: "INITIAL_MASTER_ACCOUNT_CREATED",
            resourceType: "User",
            resourceId: account.id,
            metadata: { method: "INITIAL_ADMIN_EMAIL", passwordResetRequired: true },
          },
        });
        return account;
      });
      return {
        status: "master-ready" as const,
        created: true,
        accountId: created.id,
        emailFingerprint: createHash("sha256").update(email).digest("hex").slice(0, 12),
      };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return ensureInitialMasterAccount(database, email);
      }
      throw error;
    }
  }

  if (user.role !== "SUPER_ADMIN" || !user.emailVerifiedAt) {
    const updateData = user.emailVerifiedAt
      ? { role: "SUPER_ADMIN" as const }
      : {
          role: "SUPER_ADMIN" as const,
          emailVerifiedAt: new Date(),
          passwordHash: await hash(randomBytes(48).toString("base64url"), env.BCRYPT_ROUNDS),
        };
    await database.$transaction([
      database.user.update({
        where: { id: user.id },
        data: updateData,
      }),
      database.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "INITIAL_MASTER_ADMIN_ASSIGNED",
          resourceType: "User",
          resourceId: user.id,
          metadata: {
            method: "INITIAL_ADMIN_EMAIL",
            passwordResetRequired: !user.emailVerifiedAt,
          },
        },
      }),
    ]);
  }
  return {
    status: "master-ready" as const,
    created: false,
    accountId: user.id,
    emailFingerprint: createHash("sha256").update(email).digest("hex").slice(0, 12),
  };
}

export const assignInitialAdmin = ensureInitialMasterAccount;
