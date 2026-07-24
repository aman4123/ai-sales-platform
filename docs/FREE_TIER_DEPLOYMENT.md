# Zero-cost early public deployment

This runbook is for the default [`render.yaml`](../render.yaml) deployment. It creates one Render **Free** web service and no Render database, Key Value instance, disk, worker, cron job, or paid service. The production-grade paid reference remains in [`render.production.yaml`](../render.production.yaml) and is outside the ₹250/month budget.

Limits and prices below were verified against provider documentation on 24 July 2026. Recheck the linked pricing pages before creating resources because providers can change free tiers.

## Cost boundary

| Component | Required plan | Recurring cost | Hard safety condition |
| --- | --- | ---: | --- |
| Render application | Hobby workspace + Free web service | ₹0 | Do not add a payment method. Over-limit bandwidth then suspends the service instead of billing. |
| Neon PostgreSQL | Free | ₹0 | Do not upgrade to Launch or enter billing details. |
| Upstash Redis | Free | ₹0 | Do not add a card or upgrade to Pay as You Go. |
| Resend email | Free | ₹0 | Do not upgrade. Free quota exhaustion stops sending; it does not enable paid overages. |
| AI | Built-in Mock provider | ₹0 | Keep `DEEPSEEK_API_KEY` absent and `AI_MONTHLY_REQUEST_LIMIT=0`. |
| **Total** |  | **₹0/month** | No provider has permission to charge. |

Render's Hobby workspace currently includes 5 GB outbound bandwidth and 500 build minutes/month. A workspace with no payment method is suspended or has new builds disabled when an included limit is exhausted instead of being charged. A linked payment method can make excess bandwidth or build usage billable, so a no-card workspace is mandatory for this deployment.

## Free-tier limits

- **Render Free:** 750 running instance-hours/workspace/month, sleeps after 15 minutes without inbound traffic, approximately one-minute cold starts, ephemeral filesystem, no SSH, no persistent disk, one instance, no paid pre-deploy phase, and no outbound SMTP on ports 25/465/587. Render dashboard logs, HTTPS, health checks, and the `onrender.com` domain remain available.
- **Neon Free:** ₹0 with no card, currently 100 CU-hours/project/month, 0.5 GB storage/project, 5 GB public transfer/month, scale-to-zero after five idle minutes, and an Instant Restore window up to six hours or 1 GB of changes. The application retention job limits AI history, but CRM growth still needs monitoring.
- **Upstash Redis Free:** 256 MB, 500,000 commands/month, and 10 GB bandwidth. Commands beyond the free allowance fail. A free database can be archived after extended inactivity; the console provides restoration from its archived backup.
- **Resend Free:** 100 transactional emails/day, 3,000/month, and an initial API rate limit of five requests/second. `onboarding@resend.dev` can send only to the Resend account owner's address. Sending verification or reset email to other real users requires a domain you control and have verified in Resend.
- **No SLA:** every free provider can throttle, suspend, sleep, or change limits. This architecture is appropriate for an early launch, not a contractual availability target.

Provider references: [Render Free](https://render.com/docs/free), [Render bandwidth](https://render.com/docs/outbound-bandwidth), [Neon pricing](https://neon.com/pricing), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Upstash pricing](https://upstash.com/pricing/redis), [Resend limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits), and [Resend test sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## 1. Create Neon Free PostgreSQL

1. Open <https://console.neon.tech/signup> and choose **Free — $0, no credit card required**.
2. Click **New Project**. Name it `ai-sales-platform`, choose PostgreSQL 17 if a version choice is shown, and choose the region closest to the Render service (prefer Singapore for users in India when both providers offer it).
3. Open the project and click **Connect**.
4. Enable **Connection pooling** and copy the `postgresql://...-pooler...neon.tech/...?...sslmode=require...` URL. Enter it directly in Render as `DATABASE_URL`.
5. Disable **Connection pooling** and copy the direct URL without `-pooler` in its hostname. Enter it directly in Render as `DIRECT_URL`.
6. Never paste either URL into chat, source files, a GitHub issue, or a PR. Both contain the database password.

The application uses the pooled URL with at most five local connections. Prisma migrations and logical backups use `DIRECT_URL`. Production validation rejects Neon URLs without TLS and rejects a pooled `DIRECT_URL`.

Possible charge when these instructions are followed: **₹0**. Maximum possible automatic charge without adding billing details or upgrading: **₹0**.

## 2. Create Upstash Redis Free

1. Open <https://console.upstash.com/> and sign in.
2. Click **Create Database**, select **Redis**, name it `ai-sales-platform`, select the region closest to Render/Neon, and choose **Free**.
3. Do not add a payment method and do not choose **Pay as You Go** or a Fixed plan.
4. In **Connect**, copy the TLS Redis URL beginning `rediss://default:` and enter it directly in Render as `REDIS_URL`.

The production process refuses to start if Redis cannot connect, so distributed rate limiting is never silently replaced with a weaker per-process limiter. Development and tests can fall back to in-memory limits, and emit an explicit structured warning when they do.

Possible charge when these instructions are followed: **₹0**. Maximum possible automatic charge without adding a card or upgrading: **₹0**.

## 3. Create Resend Free email

1. Open <https://resend.com/signup> and create a **Free** account.
2. Open **API Keys**, click **Create API Key**, name it `ai-sales-platform-render`, and select **Sending access** rather than full access.
3. Copy the key once and enter it directly in Render as `RESEND_API_KEY`.
4. For the first owner-only smoke test, keep `EMAIL_FROM=onboarding@resend.dev` and register using the same email address as the Resend account.
5. Before allowing arbitrary public registrations, open **Domains**, click **Add Domain**, add DNS records at a domain you already control, wait for **Verified**, and change `EMAIL_FROM` in Render to an address on that domain such as `auth@your-domain.example`.

Do not buy a domain or paid Resend plan without separate approval. Without a verified domain, registration and password-reset email cannot reach addresses other than the Resend account owner.

Possible Resend charge on Free: **₹0**. Domain registration is a separate external cost and is not authorized by this runbook.

## 4. Create the Render Free web service

Perform this only after the branch containing `render.yaml` has passed GitHub Actions.

1. Open <https://dashboard.render.com/>. Use a **Hobby** workspace with **no payment method**. If the current workspace has a card, create a separate no-card Hobby workspace before continuing.
2. Click **New + → Blueprint**, connect GitHub only when prompted, and select `aman4123/ai-sales-platform`.
3. Select branch `feature/free-tier-deployment`. Render reads the root `render.yaml`.
4. Confirm that the plan preview contains exactly one service named `ai-sales-platform-free` with instance type **Free**. It must not list Render Postgres, Key Value, a disk, worker, or cron job.
5. Enter these four dashboard values when prompted, without pasting them anywhere else:
   - `DATABASE_URL`: pooled Neon URL.
   - `DIRECT_URL`: direct/unpooled Neon URL.
   - `REDIS_URL`: Upstash `rediss://` URL.
   - `RESEND_API_KEY`: Resend sending-only key.
6. Enter `APP_BASE_URL` as `https://ai-sales-platform-free.onrender.com`. If Render assigns a different hostname, update `APP_BASE_URL` to the exact displayed HTTPS origin and redeploy.
7. Confirm `EMAIL_FROM=onboarding@resend.dev` for the owner-only test. Change it only after Resend verifies a domain.
8. Click **Apply** / **Create Web Service**. This is the external deployment approval point.

The free tier does not support Render's pre-deploy phase. The container start command therefore runs the idempotent `prisma migrate deploy` before starting the server. A failed migration prevents the new process from serving traffic. The server listens on `0.0.0.0:$PORT`, serves the built frontend and API from one origin, and uses the readiness endpoint for Render health checks.

Possible charge with a Free service in a no-card Hobby workspace: **₹0**. Maximum possible automatic charge: **₹0**; excess usage causes suspension instead.

## Environment checklist

Values marked secret must be entered only in provider dashboards.

| Variable | Required | Secret | Source/value |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | yes | Neon pooled TLS connection URL |
| `DIRECT_URL` | yes | yes | Neon direct TLS connection URL |
| `REDIS_URL` | yes | yes | Upstash `rediss://` connection URL |
| `RESEND_API_KEY` | yes | yes | Resend sending-only API key |
| `APP_BASE_URL` | yes | no | Exact Render public HTTPS origin |
| `EMAIL_FROM` | yes | no | `onboarding@resend.dev` for owner-only test; verified-domain address for public users |
| `JWT_ACCESS_SECRET` | yes | yes | Generated automatically by Render Blueprint |
| `JWT_REFRESH_SECRET` | yes | yes | Generated automatically by Render Blueprint |
| `METRICS_AUTH_TOKEN` | yes | yes | Generated automatically by Render Blueprint |
| `DEEPSEEK_API_KEY` | no | yes | Leave absent for ₹0 operation |
| `AI_MONTHLY_REQUEST_LIMIT` | yes | no | Keep `0` for ₹0 operation |

All other production values are non-secret defaults in `render.yaml`. `.env` files remain ignored; only `.env.example` is committed.

## Deployment verification

Replace `$APP_URL` locally with the Render HTTPS URL; do not store it in source code.

1. `GET $APP_URL/api/health/live` returns HTTP 200 with `status: ok`.
2. `GET $APP_URL/api/health/ready` returns HTTP 200 with PostgreSQL and Redis both `ok`.
3. Register with the Resend owner email, receive verification email, verify, and save the recovery codes.
4. Log out and log in again. Request a password reset and complete it from the email.
5. Create, edit, search, paginate, and delete a CRM lead; reload and confirm persistence.
6. Open reports and settings; update settings and confirm persistence after another login.
7. Run AI Research and AI Email in **Mock** mode; confirm history is stored and no external AI call occurs.
8. Trigger repeated requests in a controlled test and confirm HTTP 429 plus `RateLimit-*` headers. Confirm the corresponding `rl:` keys/command usage in the Upstash dashboard.
9. Inspect Render logs for structured startup messages showing PostgreSQL readiness, `rateLimitStore: redis`, and no unhandled errors.
10. Keep `/api/metrics` protected. Use the generated bearer token only from an authorized monitoring client.

## AI cost controls

Mock AI is the only enabled provider in this deployment and has no provider cost. Supplying a DeepSeek key alone is insufficient: an administrator must also set a positive `AI_MONTHLY_REQUEST_LIMIT`. Real-provider calls are then protected by:

- per-user distributed limit of 10 AI requests/hour in the free Blueprint;
- a global Redis-backed monthly request counter;
- 15-second provider timeout;
- 800 output-token request cap;
- 128 KiB response cap; and
- server-only API-key storage and redacted logs.

A request count is not a currency guarantee because provider prices can change. Before enabling real AI, obtain explicit approval, calculate the worst-case monthly provider charge for the configured request/token limits, and set a provider-side prepaid balance or hard spend cap no higher than ₹250/month. Never enable usage-based AI billing automatically.

## Backups and recovery

Neon's free Instant Restore window is useful for recent mistakes but is not a replacement for independent backups. Run `npm run db:backup` using `DIRECT_URL` and a local `BACKUP_DIRECTORY`; the script creates a PostgreSQL custom archive and validates it. Store the archive in an encrypted location outside Render's ephemeral filesystem. The existing exact-target restore workflow remains documented in [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).

Free hosting cannot run a reliable scheduled backup worker. Until an approved zero-cost encrypted storage/automation account exists, the owner must perform and record logical backups manually. That operational limitation must be accepted before real customer data is collected.
