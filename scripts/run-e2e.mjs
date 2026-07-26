import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const suite = process.argv[2];
if (!new Set(["core", "failures"]).has(suite)) {
  throw new Error("Usage: node scripts/run-e2e.mjs <core|failures>");
}

const environment = { ...process.env, E2E_SUITE: suite };
if (suite === "failures") {
  if (process.env.E2E_FAILURE_REDIS_URL) {
    environment.E2E_REDIS_URL = process.env.E2E_FAILURE_REDIS_URL;
  } else {
    const redis = new URL(process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6379/15");
    redis.pathname = "/14";
    environment.E2E_REDIS_URL = redis.toString();
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [fileURLToPath(new URL("./prepare-e2e-database.mjs", import.meta.url))]);
run(process.execPath, [fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url)), "test"]);
