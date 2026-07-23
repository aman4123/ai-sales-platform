# Production operations

## Required configuration

- Generate independent, high-entropy values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Changing either value signs users out; rotate them only during a planned session reset.
- Use the managed PostgreSQL connection string for `DATABASE_URL`. Require TLS according to the database provider's connection guidance.
- Keep `CORS_ORIGINS` empty for the recommended same-origin deployment. Add only exact `http://` or `https://` origins when a separately hosted browser client is intentional.
- Configure `DEEPSEEK_API_KEY` only when DeepSeek is enabled. The API rejects selecting DeepSeek when no key is present.
- Set `TRUST_PROXY` to the exact number of trusted proxies in front of Express. Render uses one.

## Deployment and rollback

1. CI must pass migration validation, coverage-gated tests, builds, dependency audit, and the Docker build.
2. Run `npm run db:deploy` once in the pre-deploy phase before directing traffic to the new image.
3. Verify `/api/health/live` and `/api/health/ready`, then run a login, refresh, CRM CRUD, reports, and configured AI-provider smoke test.
4. Roll back the application image through the hosting provider if application checks fail. Database migrations in this repository are additive/default/index changes and do not require a destructive rollback.

## Monitoring and incident signals

- Collect structured stdout logs and alert on repeated `fatal` events, HTTP 5xx rates, readiness failures, authentication replay detections, and AI provider 502/503 responses.
- Track p95 request latency, PostgreSQL connections and storage, rate-limit responses, container restarts, and AI provider latency.
- Preserve the `x-request-id` response header in support reports; logs use the same identifier and redact credentials, cookies, tokens, and provider keys.

## Data protection

- Enable managed PostgreSQL backups and point-in-time recovery appropriate to the service's recovery objectives. Test a restore before launch and at least quarterly.
- Restrict database network access and credentials to the application and deployment migration job.
- AI prompts and responses may contain customer data and are stored per user. Define retention and deletion policy before accepting regulated or sensitive data.
- Never put secrets in repository files, Docker build arguments, browser environment variables, or support logs.

## Scaling notes

- CRM reads are cursor-paginated and text search uses PostgreSQL trigram indexes. Reports aggregate in PostgreSQL.
- The default rate-limit store is process-local and is appropriate for the single-instance Render Blueprint. Configure a shared external store before running multiple application replicas.
- Readiness depends on PostgreSQL; liveness does not. Use the correct endpoint for traffic routing versus process restart decisions.
