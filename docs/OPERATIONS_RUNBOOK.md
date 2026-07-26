# Operations runbook

This runbook covers diagnosis and containment for the V2 single-service deployment. Never paste secrets, provider payloads, message bodies, or database connection strings into tickets or chat.

## Health and first response

1. Capture the UTC time, deployment/image identifier, request ID, affected user-safe identifier, and public symptom.
2. Check `GET /api/health/live`. Failure indicates the process is not serving requests.
3. Check `GET /api/health/ready`. A non-ready result identifies dependency categories without returning credentials or stack traces.
4. Query authenticated `/api/metrics` with the metrics bearer token from the secret manager. Do not put the token in a URL.
5. Review structured logs by request ID and safe error category. Recipient addresses are hashed; provider keys and authorization headers are redacted.
6. Pause affected campaigns before investigating delivery failures. Do not bypass approval, suppression, or budget guards.

## PostgreSQL outage or failed migration

- Symptoms: readiness fails, API database operations return generic unavailable errors, startup migration exits nonzero.
- Verify provider status and network/TLS configuration from the provider console without printing `DATABASE_URL`.
- Run `npx prisma migrate status` from a protected release shell using the direct migration connection.
- If migration status is failed or drifted, stop the rollout. Do not use `migrate dev`, manual history edits, or `resolve --applied` unless the exact baseline procedure has been independently reviewed.
- Preserve the failed database and logs. Restore the verified pre-release backup into a new database, validate row counts and auth, then point the last known-good image at the restored database.
- The legacy baseline flags are only for the documented original MVP schema. The entrypoint compares the database to the committed schema and otherwise fails closed.

## Redis outage

- Symptoms: readiness reports Redis unavailable; rate limiting, session coordination, provider caches, and monthly budget guards fail closed.
- Verify provider status and TLS URL in the provider console. Do not switch paid AI/search to an in-memory counter.
- Keep paid search, Groq, and outbound processing paused until Redis is healthy.
- After recovery, confirm readiness, rate-limit behavior, and that monthly budget keys retain a future expiry.

## Tavily, Brave, or Serper outage

- Research jobs store a safe failure code and do not create verified claims from an unavailable or malformed response.
- Confirm `/api/research/status`, the selected provider, configured monthly limit, recent `SearchUsage`, and provider-status page.
- Keep failed jobs visible; do not relabel them as completed or manually invent evidence.
- Switching providers requires an intentional configuration change, correct server-only key, budget review, and a new deployment.

## Groq outage or invalid output

- Grounded research retains deterministic evidence even when AI analysis is rejected. Campaign drafts are not created when Groq is unavailable or output fails grounding validation.
- Check the safe provider error category, global AI budget counter, timeout/retry metrics, and provider status. Raw prompts and provider responses must not enter client errors or logs.
- Do not switch to fabricated fallback content. Users may continue with deterministic CRM data and manually authored, human-reviewed content.

## Email provider outage or stuck campaign

- Pause the campaign and inspect campaign status, current content/approved versions, queued messages, attempt count, next schedule, daily limit, recipient stop reason, and safe failure category.
- Messages are bounded to three attempts. A transient provider failure stays auditable and cannot silently bypass the current approval.
- Verify the active mode: `disabled`, exact-recipient `test`, or intentionally approved `live`.
- Verify sender-domain/provider configuration and sandbox inbox. Never change to live merely to test connectivity.
- Resume only after dependency recovery and a human review of recipients, approval snapshot, suppression state, and remaining daily capacity.

## Webhook failure, replay, bounce, complaint, reply, or unsubscribe

- Confirm the webhook endpoint is `/api/webhooks/email/<provider>`, `X-Webhook-Timestamp` contains Unix seconds, and `X-Webhook-Signature` contains `sha256=<hex HMAC>` for `<timestamp>.<exact raw JSON body>` using the independent webhook secret. The signature timestamp must be within five minutes.
- Invalid signatures return 401. Unknown message IDs are accepted without leaking existence. Provider event IDs are unique and replay-safe.
- A reply creates a human-response task and cancels future follow-ups.
- Unsubscribe and complaint events create/update the hashed suppression record and stop future sends.
- Permanent bounce marks the message/recipient and prevents automation from continuing.
- Never delete a suppression record to make a campaign proceed without a documented, lawful recipient request and product/legal review.

## Authentication and account incidents

- Password reset and email verification tokens are hashed, expiring, and one-time use. Password changes and account recovery revoke active refresh sessions.
- For suspected session theft, instruct the user to recover/reset the account and log out all sessions; preserve request IDs and audit logs.
- Initial admin assignment accepts only an existing verified account, is idempotent, and writes an audit event. Run it only from a protected production shell after `npm run build`.
- Account deletion requires the exact email and explicit confirmation, then relies on reviewed database cascades. Retention removes only eligible expired/session/provider history and reply previews according to settings.

## Backup and recovery

- Create backups with `npm run db:backup` using the direct connection and an access-controlled destination.
- Test restoration into an isolated database with `npm run db:restore` and its exact-target confirmation. Never test restore over production.
- Validate migrations, user/lead/settings counts, password-hash usability, ownership, and representative V1/V2 queries before declaring recovery successful.

## Post-incident

- Record impact, timeline, request IDs, safe error categories, containment, recovery validation, and follow-up owner.
- Review whether approval, suppression, budget, retention, or audit behavior changed; treat any bypass as a security incident.
- Add a deterministic regression test before closing an engineering cause. Professional legal review remains required for jurisdiction-specific outreach and retention obligations.
