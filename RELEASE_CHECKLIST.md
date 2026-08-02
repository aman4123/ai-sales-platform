# Release Checklist

## Scope and truth

- [ ] Production-visible features work end to end or are clearly unavailable.
- [ ] Test fixtures and estimated values are labeled and tenant-isolated.
- [ ] No synthetic customer, reply, meeting, or revenue value appears in production metrics.
- [ ] Known limitations and provider requirements are current.

## Data and security

- [ ] Review working tree and full diff; preserve unrelated owner changes.
- [ ] Scan source, build output, migrations, and Git history range for secrets.
- [ ] Review every new write and read for tenant scope and owner attribution.
- [ ] Verify Master Admin bootstrap, mode switching, session revocation, and support audit behavior.
- [ ] Verify campaign approval invalidation, suppression, test allowlist, collision controls, and signed webhook replay protection.
- [ ] Take or verify a recoverable production database backup before migration.

## Required gates

Run from clean dependencies:

```text
npm ci
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm audit --audit-level=high
npm run api:lint
npm run deploy:lint
npm run test:db
npm run test:e2e
```

No failure is optional. Clean and production-upgrade migration tests must pass. Review coverage deltas rather than accepting a percentage alone.

## GitHub and deployment

- [ ] Push the reviewed feature branch without rewriting history.
- [ ] Open a PR to `main`; monitor quality, migration, E2E, container, dependency, security, and CodeQL checks.
- [ ] Merge only the exact green revision under repository policy.
- [ ] Deploy the exact merged `main` SHA to the existing Render application.
- [ ] Run database migrations once and verify readiness before traffic.
- [ ] Complete live landing, registration, verification, login, mode, provider, CRM, test-send, webhook, job, daily-brief, and isolation smoke checks.
- [ ] Confirm zero unauthorized external recipients and record factual results.
