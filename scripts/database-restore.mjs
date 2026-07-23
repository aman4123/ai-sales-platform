import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.RESTORE_DATABASE_URL;
const backupFile = process.env.RESTORE_BACKUP_FILE;
if (!databaseUrl || !backupFile) {
  throw new Error("RESTORE_DATABASE_URL and RESTORE_BACKUP_FILE are required.");
}
const parsed = new URL(databaseUrl);
if (parsed.protocol !== "postgresql:") throw new Error("Only PostgreSQL restore URLs are supported.");
const database = decodeURIComponent(parsed.pathname.slice(1));
if (process.env.CONFIRM_RESTORE_DATABASE !== database) {
  throw new Error("Set CONFIRM_RESTORE_DATABASE to the exact target database name before restoring.");
}
const absoluteBackup = path.resolve(backupFile);
if (!existsSync(absoluteBackup)) throw new Error("RESTORE_BACKUP_FILE does not exist.");
const pgEnvironment = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: database,
  ...(parsed.searchParams.get("sslmode") ? { PGSSLMODE: parsed.searchParams.get("sslmode") } : {}),
};

const verification = spawnSync("pg_restore", ["--list", absoluteBackup], {
  env: pgEnvironment,
  stdio: "ignore",
});
if (verification.status !== 0) throw new Error("The requested backup is not a valid pg_restore archive.");

const restore = spawnSync("pg_restore", [
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-privileges",
  "--exit-on-error",
  "--dbname",
  database,
  absoluteBackup,
], { env: pgEnvironment, stdio: "inherit" });
if (restore.status !== 0) throw new Error(`pg_restore failed with exit code ${restore.status ?? "unknown"}.`);
process.stdout.write(`${JSON.stringify({ status: "restored", database })}\n`);
