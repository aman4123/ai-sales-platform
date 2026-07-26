import { createHash } from "node:crypto";
import type { DatabaseClient } from "../../lib/prisma.js";

export async function assignInitialAdmin(database: DatabaseClient, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INITIAL_ADMIN_EMAIL must be a valid email address.");
  }
  const user = await database.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true, role: true },
  });
  if (!user) throw new Error("No existing user matches INITIAL_ADMIN_EMAIL.");
  if (!user.emailVerifiedAt) throw new Error("The initial administrator must verify their email first.");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    await database.$transaction([
      database.user.update({ where: { id: user.id }, data: { role: "ADMIN" } }),
      database.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "INITIAL_ADMIN_ASSIGNED",
          resourceType: "User",
          resourceId: user.id,
          metadata: { method: "INITIAL_ADMIN_EMAIL" },
        },
      }),
    ]);
  }
  return {
    status: "admin-ready" as const,
    emailFingerprint: createHash("sha256").update(email).digest("hex").slice(0, 12),
  };
}
