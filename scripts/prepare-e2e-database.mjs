import { createClient } from "redis";
import {
  recreateDatabase,
  requireIsolatedDatabase,
  runPrisma,
} from "./database-test-utils.mjs";

// This dedicated entry point is itself the explicit opt-in to destructive test setup.
// The shared helper still enforces a loopback host and a database name containing test/ci.
process.env.RUN_DATABASE_TESTS = "true";

const target = requireIsolatedDatabase("E2E_DATABASE_URL");
const redisRaw = process.env.E2E_REDIS_URL;
if (!redisRaw) throw new Error("E2E_REDIS_URL is required.");
const redisUrl = new URL(redisRaw);
if (!["127.0.0.1", "localhost", "::1"].includes(redisUrl.hostname)) {
  throw new Error("E2E_REDIS_URL must use a loopback host.");
}
if (!redisUrl.pathname || redisUrl.pathname === "/0") {
  throw new Error("E2E_REDIS_URL must use a dedicated non-zero Redis database.");
}

await recreateDatabase(target);
runPrisma(["migrate", "deploy"], target.raw);

const redis = createClient({ url: redisRaw });
await redis.connect();
try {
  await redis.flushDb();
} finally {
  await redis.quit();
}
process.stdout.write(`${JSON.stringify({ status: "e2e-database-ready", database: target.databaseName, redisDatabase: redisUrl.pathname.slice(1) })}\n`);
