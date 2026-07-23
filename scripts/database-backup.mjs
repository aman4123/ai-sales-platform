import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL;
const outputDirectory = process.env.BACKUP_DIRECTORY;
if (!databaseUrl || !outputDirectory) {
  throw new Error("BACKUP_DATABASE_URL (or DATABASE_URL) and BACKUP_DIRECTORY are required.");
}

const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:") throw new Error("Only PostgreSQL backup URLs are supported.");
const database = decodeURIComponent(parsed.pathname.slice(1));
const absoluteDirectory = path.resolve(outputDirectory);
mkdirSync(absoluteDirectory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(":", "-");
const backupPath = path.join(absoluteDirectory, `${database}-${timestamp}.dump`);
const pgEnvironment = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: database,
  ...(parsed.searchParams.get("sslmode") ? { PGSSLMODE: parsed.searchParams.get("sslmode") } : {}),
};

const backup = spawnSync("pg_dump", [
  "--format=custom",
  "--compress=9",
  "--no-owner",
  "--no-privileges",
  "--file",
  backupPath,
], { env: pgEnvironment, stdio: "inherit" });
if (backup.status !== 0) throw new Error(`pg_dump failed with exit code ${backup.status ?? "unknown"}.`);

const verification = spawnSync("pg_restore", ["--list", backupPath], {
  env: pgEnvironment,
  stdio: "ignore",
});
if (verification.status !== 0) throw new Error("The backup was created but failed pg_restore validation.");
process.stdout.write(`${JSON.stringify({ status: "verified", backupPath })}\n`);
