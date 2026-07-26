# Database backup, restore, and disaster recovery

## Objectives and layers

- The default zero-cost deployment uses Neon Free. Its provider-managed Instant Restore window is limited (currently up to six hours or 1 GB of changes), so independent logical backups remain necessary.
- `render.production.yaml` preserves the paid Render PostgreSQL reference. Render paid recovery capabilities and retention depend on the selected plan and must be confirmed before that topology is approved.
- Create encrypted logical backups for longer retention or provider independence. `npm run db:backup` produces a PostgreSQL custom archive and verifies it with `pg_restore --list` before reporting success.
- Recommended starting objectives are RPO 15 minutes and RTO 60 minutes. The business owner must approve tighter or looser objectives based on sales-data value and cost.

## Logical backup

Set `BACKUP_DATABASE_URL`, `DIRECT_URL`, or `DATABASE_URL` plus `BACKUP_DIRECTORY`, then run `npm run db:backup` from a checked-out workspace or `node scripts/database-backup.mjs` inside the production image. For Neon, use the direct URL without `-pooler`. Upload the verified archive to an encrypted, versioned object store with a separate access policy. A production schedule and object store require an external provider account; do not retain the only copy on an application filesystem or Render Cron instance.

The free Render web service sleeps and cannot run a dependable backup schedule. Until a separate approved automation/storage account exists, perform backups manually and record completion. Do not collect irreplaceable customer data without accepting this RPO limitation.

Retain daily backups for 35 days and monthly backups for 12 months unless legal or contractual policy requires a different period. Monitor job completion, archive size anomalies, upload completion, and retention deletion.

## Isolated restore drill

1. Provision an empty PostgreSQL 17 instance that cannot receive production traffic.
2. Select a backup and set `RESTORE_DATABASE_URL`, `RESTORE_BACKUP_FILE`, and `CONFIRM_RESTORE_DATABASE` to the exact empty target database name.
3. Run `npm run db:restore`. The exact-name confirmation is mandatory because restore uses `--clean --if-exists` inside the target database.
4. Run `npm run db:deploy` to apply any migrations newer than the archive.
5. Start the application against the restored instance and verify account counts, tenant isolation, CRM values, reports, and a representative checksum/query agreed with the business owner.
6. Destroy the isolated drill environment only after recording the backup time, restore duration, validation results, and approver.

## Provider recovery incident

1. Stop writes or remove the application from traffic when continued writes would worsen loss.
2. In Neon, use **Restore** / **Instant Restore** to create or restore a branch at a timestamp before the incident. For the paid Render reference, use Render's Recovery page. Never overwrite the only original copy.
3. Validate the recovered instance in isolation using the checks above.
4. Update `DATABASE_URL`, deploy, verify readiness and smoke tests, then restore traffic.
5. Preserve the old instance until incident review and data reconciliation are complete.

Run an isolated restore before launch and at least quarterly. A backup is not considered successful until a restore has been verified.
