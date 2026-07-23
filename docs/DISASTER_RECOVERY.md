# Database backup, restore, and disaster recovery

## Objectives and layers

- The Render Blueprint selects a paid PostgreSQL instance. Render paid databases provide point-in-time recovery; the actual recovery window depends on the workspace plan and must be confirmed in the dashboard.
- Create encrypted logical backups for longer retention or provider independence. `npm run db:backup` produces a PostgreSQL custom archive and verifies it with `pg_restore --list` before reporting success.
- Recommended starting objectives are RPO 15 minutes and RTO 60 minutes. The business owner must approve tighter or looser objectives based on sales-data value and cost.

## Logical backup

Set `BACKUP_DATABASE_URL` (or `DATABASE_URL`) and `BACKUP_DIRECTORY`, then run `npm run db:backup` from a checked-out workspace or `node scripts/database-backup.mjs` inside the production image. Upload the verified archive to an encrypted, versioned object store with a separate access policy. A production schedule and object store require an external provider account; do not retain the only copy on an application filesystem or Render Cron instance.

Retain daily backups for 35 days and monthly backups for 12 months unless legal or contractual policy requires a different period. Monitor job completion, archive size anomalies, upload completion, and retention deletion.

## Isolated restore drill

1. Provision an empty PostgreSQL 17 instance that cannot receive production traffic.
2. Select a backup and set `RESTORE_DATABASE_URL`, `RESTORE_BACKUP_FILE`, and `CONFIRM_RESTORE_DATABASE` to the exact empty target database name.
3. Run `npm run db:restore`. The exact-name confirmation is mandatory because restore uses `--clean --if-exists` inside the target database.
4. Run `npm run db:deploy` to apply any migrations newer than the archive.
5. Start the application against the restored instance and verify account counts, tenant isolation, CRM values, reports, and a representative checksum/query agreed with the business owner.
6. Destroy the isolated drill environment only after recording the backup time, restore duration, validation results, and approver.

## Point-in-time recovery incident

1. Stop writes or remove the application from traffic when continued writes would worsen loss.
2. In Render's Recovery page, restore to a new database at a timestamp before the incident. Never overwrite the only original copy.
3. Validate the recovered instance in isolation using the checks above.
4. Update `DATABASE_URL`, deploy, verify readiness and smoke tests, then restore traffic.
5. Preserve the old instance until incident review and data reconciliation are complete.

Run an isolated restore before launch and at least quarterly. A backup is not considered successful until a restore has been verified.
