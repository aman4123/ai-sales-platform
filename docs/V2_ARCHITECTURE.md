# AI Sales Platform V2 architecture

V2 is a human-approved sales operating system. It prepares research, qualification, drafts, and bounded delivery work, but it does not grant the model authority to invent prospect data or send unapproved messages.

## Safety model

The system enforces four separate trust boundaries:

1. Search providers return untrusted public search results.
2. Retrieval accepts only public HTTP(S) destinations, checks DNS and every redirect, limits time and bytes, accepts text content only, sanitizes HTML, and drops content containing prompt-injection patterns.
3. Groq receives normalized evidence objects only. Model facts must reference existing evidence IDs and match an evidence field and value exactly; unsupported facts are discarded.
4. Campaign content is a draft until a person approves an immutable snapshot of recipients, messages, sequence, sender identity, content version, and limits. Any relevant edit increments the version and invalidates approval.

No search key means the API and UI return: `Live search is not configured. Verified company research is unavailable.` There is no generated fallback company data.

## Data flow

```text
User goal
  -> draft plan / ICP (no external action)
  -> explicit paid-search confirmation
  -> selected SearchProvider
  -> normalized evidence + confidence + conflicts
  -> optional Groq analysis constrained to evidence IDs
  -> validation removes unsupported output
  -> user saves selected company to CRM
  -> grounded message drafts
  -> manual review and immutable approval
  -> explicit queue confirmation
  -> explicit approved-batch delivery
  -> signed delivery events / replies / opt-outs
  -> future messages stop and a human task is created
```

## Components

- Command Center: converts a high-level objective into a draft plan and lists separate approvals.
- ICP service: produces fit/exclusion criteria and an explainable deterministic score. Company pain points remain “requires confirmation” unless evidenced.
- Research: supports Tavily, Brave Search, or Serper through one provider interface. Redis holds hashed cache keys and the fail-closed monthly counter.
- CRM: user-owned companies, public professional contacts, leads, deals, activities, notes, research history, filters, sorting, cursor pagination, deduplication, and import validation.
- Campaigns: recipients, grounded messages, bounded follow-ups, content versions, immutable approval snapshots, queue state, pause/resume/stop controls, daily limits, idempotency keys, and bounded delivery attempts.
- Operations: replies that require human judgment, task state, and metrics computed from stored records. Opens, clicks, and positive reply rates remain unavailable unless their required provider/manual signals exist.
- Admin: role-protected aggregate counts, sanitized provider configuration state, budgets, abuse flags, campaign state, and audit metadata. It does not return message bodies or provider keys.

## Provider configuration

### Search

Set all of the following:

```dotenv
SEARCH_ENABLED=true
SEARCH_PROVIDER=TAVILY # TAVILY, BRAVE, or SERPER
TAVILY_API_KEY=        # or BRAVE_SEARCH_API_KEY / SERPER_API_KEY
SEARCH_MONTHLY_REQUEST_LIMIT=100
SEARCH_RESULT_LIMIT=5
SEARCH_REQUEST_TIMEOUT_MS=10000
SEARCH_RESPONSE_MAX_BYTES=262144
SEARCH_CACHE_TTL_SECONDS=3600
SEARCH_MAX_RETRIES=2
```

The selected key stays server-side and is redacted from structured logs. Provider health reports configuration state; it does not spend a request on page load.

### AI

```dotenv
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
AI_MONTHLY_REQUEST_LIMIT=0
AI_REQUEST_TIMEOUT_MS=30000
AI_RESPONSE_MAX_BYTES=262144
AI_MAX_TOKENS=1500
```

Keep the monthly limit at `0` to disable paid AI. The V1 `AI_MONTHLY_REQUEST_LIMIT` counter and behavior remain the budget authority.

### Email and webhooks

Account lifecycle email continues to use `EMAIL_DELIVERY_MODE=log|smtp|resend`. Campaign delivery additionally requires:

```dotenv
OUTBOUND_EMAIL_ENABLED=false
OUTBOUND_DELIVERY_MODE=disabled
OUTBOUND_TEST_RECIPIENT=
OUTBOUND_DAILY_LIMIT=25
OUTBOUND_FOLLOW_UP_LIMIT=2
EMAIL_WEBHOOK_SECRET=
```

`disabled` refuses every campaign delivery. `test` requires outbound to be enabled and permits only the exact server-side `OUTBOUND_TEST_RECIPIENT`; use it with Mailpit or a provider sandbox. `live` permits real recipients only after all normal approval, suppression, schedule, and explicit batch-authorization checks and requires an independent webhook secret of at least 32 characters. Outbound remains disabled in `log` account-email mode. Configure a verified sender with the provider, add an unsubscribe footer in Settings, approve the current campaign version, queue it explicitly, and authorize each due batch. Provider webhooks use a timestamped HMAC-SHA256 of the exact raw JSON body, enforce a five-minute signature replay window, remain idempotent by provider event ID, and store normalized event state rather than raw payloads.

## Database and migrations

Apply committed migrations with:

```bash
npm run prisma:validate
npm run prisma:generate
npm run db:deploy
```

`20260726173000_v2_human_approved_sales_os` is additive: it adds V2 enum values, nullable columns, tables, indexes, and foreign keys without dropping V1 data. `20260726173100_default_user_role` changes the registration default only after the new enum value exists. `20260726190000_release_candidate_constraints` adds range/target/source checks and database-level approval immutability without rewriting existing rows. Back up an existing database and run both `npm run test:db:clean` and `npm run test:db:upgrade` in isolated PostgreSQL before release.

User retention settings remove expired research jobs and delivery-event records and clear old reply previews in the bounded maintenance job. Account deletion requires the signed-in user to submit both their exact email and the literal `DELETE`; database cascades remove user-owned records.

## Initial administrator

Register and verify the intended account, set `INITIAL_ADMIN_EMAIL` only in the server environment, then run:

```bash
npm run build
npm run admin:assign-initial
```

The script refuses unknown or unverified accounts, does not hard-code an address, records an audit event, and prints only a one-way email fingerprint. Later admin access is enforced both in the UI and API.

## Human approval and anti-spam controls

- Paid search, bulk drafting, queueing, and every delivery batch require explicit confirmation.
- A changed recipient list, message, sender identity, sequence, or sending limit invalidates approval.
- Queuing and sending require both a current campaign version and a matching immutable approval record.
- Delivery rechecks ownership, schedule, approval, suppression, opt-out, reply, confidence, attempt count, and per-user/global daily limits.
- Replies, opt-outs, permanent failures, complaints, low confidence, paused campaigns, and exhausted daily limits stop or defer automation.
- Replies create `Human response required.` tasks. The system never auto-negotiates pricing, contracts, commitments, legal terms, or sensitive topics.

Users remain responsible for lawful recipient selection, legitimate interest or consent, sender verification, local anti-spam/privacy rules, provider terms, and responding to recipients. The platform does not claim worldwide legal coverage.

## Testing

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm audit --audit-level=high
npm run test:db
npm run test:e2e
```

Database rehearsals require `RUN_DATABASE_TESTS=true` plus loopback URLs whose database names contain `test` or `ci`. End-to-end tests require `E2E_DATABASE_URL`, dedicated nonzero Redis databases, Mailpit, and installed Playwright browsers. `npm run test:live-integrations` is disabled unless `RUN_LIVE_INTEGRATION_TESTS=true`. Never point test execution at a production database.

## Known limitations

- Provider credentials were intentionally not added to the repository. Live Tavily/Brave/Serper retrieval, live Groq grounding, outbound delivery, and signed provider callbacks require deployment credentials and provider-side setup.
- Approved scheduled messages are processed through an explicit bounded batch endpoint; no unattended background outbound worker is enabled by default.
- Contact discovery is limited to public professional details exposed by configured search results. There is no private-data enrichment or scraping bypass.
- Positive reply classification is manual. Open and click metrics are not calculated without trustworthy provider events.
- The legal pages are operational summaries, not jurisdiction-specific legal advice, and require counsel review before public launch.
