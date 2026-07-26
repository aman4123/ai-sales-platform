import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { assignInitialAdmin } from "./modules/admin/admin.assignment.js";

if (!env.INITIAL_ADMIN_EMAIL) {
  throw new Error("INITIAL_ADMIN_EMAIL is required.");
}

try {
  const result = await assignInitialAdmin(prisma, env.INITIAL_ADMIN_EMAIL);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await prisma.$disconnect();
}
