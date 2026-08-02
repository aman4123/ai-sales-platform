# Security and Trust

## Controls in this repository

- Signed short-lived access tokens, hashed refresh tokens, revocation, rotation, replay response, verified-email login, reset-token expiry, and recovery-code rotation.
- A separate `MASTER_ADMIN` role bootstrapped only from `MASTER_ADMIN_EMAIL`, with audited assignment and no configured password.
- Server-enforced User, isolated Tester, and Master Admin workspace contexts.
- Time-limited, reason-bound support sessions with a visible banner; read-only is the default.
- Tenant ownership columns, foreign keys, indexes, database constraints, and route-level tenant scopes.
- Validated request bodies, bounded pagination, security headers, rate limits, safe error responses, and redacted logging.
- SSRF, private-address, unsafe-port, redirect, content-type, response-size, and timeout controls for retrieved content.
- Webhook HMAC validation, timestamp replay windows, event idempotency, suppression, and stop rules.
- Immutable campaign approvals, approval invalidation after changes, exact test-recipient allowlisting, global hashed anti-abuse counters, and provider failure containment.
- Secrets remain server-side and are never returned by provider-status endpoints.

## Data truth

Retrieved content is untrusted. A value is verified only when linked to stored evidence. Prompt injection is isolated and flagged. Unsupported model output is rejected. Test workspaces and production workspaces have different tenant identities and data labels.

## Operational limits

This software does not by itself establish legal compliance, sender-domain reputation, or provider acceptance. Live email must remain disabled until the operator verifies the sender/domain, supplies a lawful policy and business footer, configures signed webhooks, reviews jurisdictional requirements, and completes a controlled ramp-up.

Report suspected vulnerabilities through the private security contact configured by the operator; do not include credentials or customer data in public issues.
