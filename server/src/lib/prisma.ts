import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
  statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
  query_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
  application_name: "ai-sales-platform",
});

export const prisma = new PrismaClient({ adapter });

export type DatabaseClient = PrismaClient;
