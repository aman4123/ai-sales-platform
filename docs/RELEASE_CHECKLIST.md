# Production release checklist

This checklist is a release gate, not a substitute for evidence. Record command output and a reviewer for every checked item. Never run migration rehearsals against production or an unknown database.

## Change and repository safety

- [ ] Confirm the release branch and intended base commit.
- [ ] Review `git status`, `git diff --stat`, `git diff --check`, and `git diff --name-status`.
- [ ] Confirm no `.env`, credentials, database dumps, browser artifacts, or generated test output is tracked.
- [ ] Run the repository secret scan and review the complete diff for key logging, prompt leakage, stack traces, and authorization regressions.
- [ ] Obtain product, security, and professional legal review. The bundled legal pages are product disclosures, not a compliance certification.

## Database safety

- [ ] Create and verify a restorable production backup before migration.
- [ ] Run `npm run test:db:clean` with `RUN_DATABASE_TESTS=true` and an isolated loopback `CLEAN_MIGRATION_DATABASE_URL` whose database name contains `test` or `ci`.
- [ ] Run `npm run test:db:upgrade` with the same guard and an isolated `UPGRADE_MIGRATION_DATABASE_URL`.
- [ ] Confirm V1 user, session, lead, settings, AI request, token, and recovery-code counts remain unchanged.
- [ ] Confirm all committed migrations report applied via `npm run db:deploy` and `npx prisma migrate status`.
- [ ] Confirm the migration contains no unreviewed drop, truncate, delete, or data-rewrite operation.
- [ ] Confirm `DATABASE_URL` is the runtime pool URL and `DIRECT_URL` is the migration/backup connection where the provider requires separation.

Rollback is recovery-based: stop application traffic, preserve diagnostics, restore the verified pre-release backup into a new database, point the service to that database, and redeploy the last known-good image. Do not edit Prisma migration history manually.

## Automated quality gates

- [ ] `npm ci`
- [ ] `npm run prisma:validate`
- [ ] `npm run prisma:generate`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm audit --audit-level=high`
- [ ] `npm run api:lint`
- [ ] `npm run deploy:lint`
- [ ] `npm run test:e2e` against disposable PostgreSQL, Redis, Mailpit, and deterministic provider fixtures
- [ ] Build and smoke-test the production container, including readiness, static assets, authentication, and graceful shutdown.
- [ ] Inspect the image and confirm it runs as a non-root user and contains no `.env`, Git history, tests, browser output, or obvious credentials.

## Provider and budget controls

- [ ] Keep search disabled unless exactly one provider key and a positive `SEARCH_MONTHLY_REQUEST_LIMIT` are intentionally configured.
- [ ] Keep Groq unavailable to user settings unless `GROQ_API_KEY`, Redis, and a positive `AI_MONTHLY_REQUEST_LIMIT` are configured.
- [ ] Verify provider timeouts, response-size limits, retry bounds, caching, and global monthly budget rejection.
- [ ] Run `npm run test:live-integrations` only with `RUN_LIVE_INTEGRATION_TESTS=true` and explicitly approved low-cost test credentials.
- [ ] Never set `LIVE_TEST_EMAIL_CONFIRM=SEND_ONE_TRANSACTIONAL_SMOKE` without an owned `LIVE_TEST_EMAIL_RECIPIENT`.

## Delivery and campaign safety

- [ ] Begin staging with `OUTBOUND_EMAIL_ENABLED=false` and `OUTBOUND_DELIVERY_MODE=disabled`.
- [ ] For staging delivery, use `OUTBOUND_DELIVERY_MODE=test` and one exact `OUTBOUND_TEST_RECIPIENT` connected to a sandbox inbox.
- [ ] Confirm the UI identifies the active delivery mode.
- [ ] Confirm a current immutable approval snapshot is required after every recipient, content, sender, sequence, schedule, or limit change.
- [ ] Confirm queueing does not send and sending requires a second explicit authorization.
- [ ] Confirm suppression, unsubscribe, complaint, permanent bounce, reply, retry, and daily-limit behavior with the failure E2E suite.
- [ ] Move to `OUTBOUND_DELIVERY_MODE=live` only after sender-domain verification, webhook configuration, deliverability review, and a named human approval.

## Production configuration

- [ ] Use independent high-entropy access, refresh, metrics, and webhook secrets.
- [ ] Set `APP_BASE_URL` to the exact public HTTPS origin and keep `CORS_ORIGINS` to reviewed origins only.
- [ ] Set `TRUST_PROXY` to the actual proxy hop count.
- [ ] Confirm PostgreSQL and Redis TLS requirements for the selected providers.
- [ ] Confirm `/api/health/live`, `/api/health/ready`, and authenticated `/api/metrics` behavior without sensitive output.
- [ ] Confirm provider keys and connection strings are server-only and absent from the frontend bundle.
- [ ] Assign the first administrator only after the account verifies its email: build the release, set `INITIAL_ADMIN_EMAIL`, then run `npm run admin:assign-initial` once from a protected shell. Record the audit event, not the address.

## Launch evidence

- [ ] Record exact test counts, browser projects, duration, image digest/size, startup time, health response, and migration status.
- [ ] Record all skipped checks as launch blockers unless the release owner explicitly accepts them.
- [ ] Record known limitations: no autonomous web browsing, sources may be incomplete, public contacts require human verification, positive reply classification is unavailable unless a provider supplies it, and legal review remains external.
- [ ] Obtain final CTO release decision before commit, tag, deployment, or live delivery activation.
