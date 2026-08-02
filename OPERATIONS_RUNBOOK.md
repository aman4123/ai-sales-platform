# Operations Runbook

## Normal operation

The web process serves the UI/API and runs a single bounded database-backed automation worker. PostgreSQL is the durable source of truth. Redis provides distributed rate and usage counters; failure-sensitive paths fail closed or surface degraded readiness. Long jobs use idempotency keys, attempt limits, timeouts, exponential backoff, cancellation state, and audit records.

Check `/api/health/live` for process liveness and `/api/health/ready` for database readiness. Master Admin `/api/admin/system` reports sanitized database, Redis, worker, provider, queue, and deployed-revision state.

## Deployment

1. Complete `RELEASE_CHECKLIST.md`.
2. Verify a current backup with `npm run db:backup` under the documented production environment.
3. Deploy migrations with `npm run db:deploy` before starting the new revision.
4. Deploy the exact verified `main` SHA to the existing Render service.
5. Confirm readiness, migration history, worker activity, and frontend/API revision.
6. Execute only an allowlisted campaign test until sender and webhook configuration is verified.

Never print database URLs, API keys, SMTP credentials, webhook secrets, JWT secrets, raw session tokens, or customer message bodies.

## Incident response

For unsafe sending, use the tenant emergency-stop endpoint, disable `OUTBOUND_EMAIL_ENABLED`, and revoke provider credentials if compromise is suspected. Preserve audit records and hashed recipient-safety state.

For a job storm, pause affected departments, cancel pending jobs through Master Admin, inspect idempotency keys and error codes, and retry only after the cause is corrected.

For provider failure, leave the feature unavailable, verify bounded retries, and do not reclassify unconfirmed delivery as success.

For suspected tenant leakage, disable affected access, preserve logs, rotate relevant secrets, investigate every tenant-scoped query and export, notify the authorized incident owner, and do not expose one tenant’s details to another.

For database migration failure, stop rollout, keep the prior application revision, restore only through the tested restore procedure when forward recovery is unsafe, and record the exact schema/revision pair.

## Backup and recovery

Backups must be encrypted, access-controlled, retention-bounded, and restore-tested. `database-backup.mjs` and `database-restore.mjs` reject unsafe targets and require explicit production confirmation. A backup file is not considered valid until a restore into an isolated database succeeds.
