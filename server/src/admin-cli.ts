import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { assignInitialAdmin } from "./modules/admin/admin.assignment.js";

const masterAdminEmail = env.MASTER_ADMIN_EMAIL ?? env.INITIAL_ADMIN_EMAIL;
if (!masterAdminEmail) {
  throw new Error("MASTER_ADMIN_EMAIL is required.");
}

try {
  const result = await assignInitialAdmin(prisma, masterAdminEmail);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await prisma.$disconnect();
}
