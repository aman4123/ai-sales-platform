# Production operations

## Required configuration

- Generate independent high-entropy `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values. Rotation signs every user out and must be treated as a planned session reset.
- Use managed PostgreSQL and Redis connection strings. Keep both services private, require provider-recommended transport security, and grant application credentials only the permissions they need.
- Keep `CORS_ORIGINS` empty for same-origin deployment. Add only exact origins. Set `TRUST_PROXY` to the exact trusted proxy count; Render uses one.
- Set `APP_BASE_URL` to the public HTTPS origin. Production validation rejects insecure application URLs, absent Redis, log-only email, missing SMTP, and weak or absent metrics credentials.
- Configure `DEEPSEEK_API_KEY` only when DeepSeek is enabled. The settings API rejects selecting an unconfigured provider.

## Deployment

1. Require the CI quality, browser E2E, container, vulnerability, and CodeQL checks.
2. Take or confirm a recent recoverable database point before a migration-bearing release.
3. Run `npm run db:deploy` as the pre-deploy command. Migrations are committed, deterministic, and applied exactly once by Prisma.
4. Deploy the immutable image, then require `/api/health/live` and `/api/health/ready` before accepting traffic.
5. Smoke test registration/email verification, login/refresh/logout, CRM CRUD and isolation, reports, account reset, recovery codes, and the configured AI provider.
6. Verify the metrics scrape, log ingestion, and alert evaluation timestamps after every environment launch.

## Rollback

- Roll back the application image through the hosting provider when runtime checks fail. Every current migration is backward-compatible with the preceding application version, so an image rollback does not require dropping schema objects.
- Do not manually edit Prisma migration history and do not run destructive down migrations in an incident. Correct forward when data is intact.
- For data loss or a destructive migration, restore PostgreSQL to a new isolated instance, validate it, then change `DATABASE_URL`. Follow `DISASTER_RECOVERY.md`.
- Changing JWT secrets is an emergency containment action that invalidates all access and refresh tokens. Revoke active refresh rows as part of a credential incident.

## Security operations

- Preserve `x-request-id` in support and incident reports. Structured logs carry the same identifier and redact credentials, cookies, reset tokens, recovery codes, provider keys, and SMTP secrets.
- Treat refresh-token replay warnings and account-recovery events as security signals. Correlate them with request ID, user ID, source IP, and user agent.
- Review GitHub dependency alerts and CodeQL findings continuously. Patch critical issues immediately and high issues within the risk window defined by the owner.
- AI prompts and responses can contain customer data. The default retention is 90 days; set a lower value when contractual or regulatory policy requires it.

## Scaling and graceful failure

- All three rate-limit scopes use Redis and therefore remain consistent across replicas. Redis failure fails requests and readiness rather than silently bypassing limits.
- CRM lists are cursor-paginated, search uses trigram GIN indexes, tenant/status/time indexes support common filters, and reports aggregate in PostgreSQL.
- SIGTERM/SIGINT stop new HTTP work, close the server, and disconnect PostgreSQL and Redis within ten seconds. Unhandled errors trigger the same controlled shutdown.
- Liveness checks only the process. Readiness checks PostgreSQL and Redis and returns a redacted 503 response when either is unavailable.
