import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;

export function requireIsolatedDatabase(variableName) {
  if (process.env.RUN_DATABASE_TESTS !== "true") {
    throw new Error("Database rehearsals require RUN_DATABASE_TESTS=true.");
  }
  const raw = process.env[variableName];
  if (!raw) throw new Error(`${variableName} is required.`);
  const url = new URL(raw);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    throw new Error(`${variableName} must be a PostgreSQL URL.`);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`${variableName} must use a loopback host.`);
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]*(?:test|ci)[A-Za-z0-9_]*$/i.test(databaseName)) {
    throw new Error(`${variableName} database name must contain "test" or "ci".`);
  }
  if (databaseName === "postgres") {
    throw new Error("The PostgreSQL maintenance database cannot be used for rehearsals.");
  }
  return { url, raw, databaseName };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error("Unsafe database identifier.");
  return `"${value}"`;
}

export async function recreateDatabase(target) {
  const adminUrl = new URL(target.raw);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [target.databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(target.databaseName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(target.databaseName)}`);
  } finally {
    await admin.end();
  }
}

export function runPrisma(arguments_, databaseUrl) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...arguments_],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
      encoding: "utf8",
      stdio: "pipe",
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Prisma ${arguments_.join(" ")} failed with exit code ${result.status}.`);
  }
}

export async function withDatabase(databaseUrl, callback) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
