# Monitoring and alerting runbook

## Signals provided

- `GET /api/metrics` returns Prometheus process and HTTP metrics after validating `Authorization: Bearer <METRICS_AUTH_TOKEN>` in constant time.
- Structured JSON logs include request IDs, HTTP status and latency, startup/shutdown events, email outcomes, refresh-token replay, account recovery, Redis errors, and AI provider failures.
- `/api/health/live` is for process restarts. `/api/health/ready` is for traffic removal and validates both PostgreSQL and Redis.
- `ops/prometheus/prometheus.yml` is a deployment template. `ops/prometheus/alerts.yml` includes 5xx, p95 latency, target absence, and rate-limit spike alerts.

## Production setup

For the ₹0 early-launch topology, Render's dashboard log stream and health check are the configured baseline; no paid collector is required. Check `/api/health/ready`, Render Events/Logs, Neon usage, Upstash command usage, and Resend quota manually after every deployment and at least weekly. Do not add a paid log, uptime, or paging service without explicit approval. Because the Free web service sleeps, an external uptime probe would also change its sleep and usage behavior.

For an approved always-on production topology:

1. Create a metrics/logging workspace (Grafana Cloud, Datadog, or an equivalent provider) and a paging destination owned by the on-call team.
2. Store `METRICS_AUTH_TOKEN` in the deployment and monitoring secret stores. Never place it in Prometheus YAML or the repository.
3. Point the scraper at the public HTTPS `/api/metrics` endpoint or a private service route. Confirm the target is up and alert rules are evaluating.
4. Ingest stdout as JSON. Redact again at the collector boundary and restrict log access because IP addresses and user IDs are operational personal data.
5. Add provider-native alerts for container restarts, PostgreSQL connection/storage pressure, Redis memory/availability, email delivery failures, TLS expiry, and backup/PITR failures.

## Minimum paging policy

- Page: readiness unavailable for five minutes, metrics target absent for five minutes, 5xx ratio above 2% for ten minutes, database/Redis unavailable, or repeated refresh-token replay across accounts.
- Warn: p95 API latency above one second for fifteen minutes, sustained rate-limit spikes, transactional-email failures, AI 502/503 spikes, database storage above 75%, or backup verification overdue.
- Every page must link to the deployment, logs filtered by request ID, this runbook, and the recovery runbook.

## Verification

Before launch and quarterly, trigger a synthetic non-production 5xx or temporarily evaluate the alert expression against a safe test metric, confirm page delivery, acknowledge it, and record time-to-detect and time-to-acknowledge. Do not create artificial production customer failures.
