# Production SaaS v2 implementation plan

This plan records the production hardening work performed on `feature/production-saas-v2`.

1. **Audit the MVP** — inventory every tracked file and reference screenshot, verify Git state, run the baseline build/lint/audit, and identify frontend data contracts.
2. **Establish the platform foundation** — retain the Vite/React UI, add an Express 5 TypeScript server, strict environment validation, structured logging, health checks, and shared error responses.
3. **Add durable persistence** — model users, refresh sessions, leads, settings, and AI requests in PostgreSQL with Prisma 7; create and validate the initial migration.
4. **Secure authentication** — implement registration, login, logout, JWT access tokens, rotating hashed refresh sessions, HTTP-only cookies, route protection, and account isolation.
5. **Replace browser-only storage** — connect CRM CRUD, dashboard metrics, reports, settings, and profile screens to authenticated database APIs without redesigning the interface.
6. **Ship AI APIs** — add validated research and email endpoints, per-user provider selection, request history, strict rate limits, a safe mock provider, and optional DeepSeek integration.
7. **Harden and verify** — add Helmet, explicit CORS policy, payload limits, tiered rate limiting, request IDs, secret redaction, API tests, linting, type-checking, builds, migration validation, and dependency audits.
8. **Operationalize** — provide a non-root multi-stage Docker image, PostgreSQL Docker Compose stack, GitHub Actions CI, Render Blueprint, environment template, and deployment documentation.
9. **Production-readiness hardening** — add cursor pagination and database-side analytics, least-privilege registrations, JWT issuer/audience validation, bounded AI responses, replay-safe refresh rotation, responsive accessible navigation, frontend error containment, secure Compose defaults, pinned CI actions, coverage gates, browser tests, and real PostgreSQL integration tests.
10. **Account and scale hardening** — add email verification, reset and backup-code recovery, SMTP delivery, Redis-distributed rate limits, authenticated Prometheus metrics, alert rules, cross-browser E2E coverage, CodeQL/container scanning, API documentation, and tested backup/restore tooling.

All implementation and production-readiness steps are complete on the feature branch.
