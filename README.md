# AI Sales Platform

A production-oriented AI sales CRM with a React/Vite frontend, Express/TypeScript API, PostgreSQL, Prisma, secure JWT sessions, database-backed analytics, and optional DeepSeek generation.

The existing dark dashboard experience is preserved while its former local-only data layer is replaced with an authenticated multi-user backend.

## Capabilities

- Registration, login, logout, short-lived JWT access tokens, and rotating HTTP-only refresh sessions
- Per-user CRM lead creation, editing, deletion, indexed search, cursor pagination, status tracking, and deal values
- Live dashboard and six-month reports aggregated in PostgreSQL without loading entire customer datasets
- Database-backed profile, company, email, notification, theme, and AI-provider settings
- Validated AI research and sales-email APIs with mock and optional DeepSeek providers
- Request IDs, structured/redacted logs, Helmet headers, CORS policy, body limits, and tiered rate limits
- Liveness and database-readiness probes
- Unit, browser, and real-PostgreSQL integration tests with enforced coverage floors
- Strict TypeScript, ESLint, dependency auditing, hardened Docker/Compose, pinned GitHub Actions, and Render configuration

## Architecture

```text
React + Vite UI
      │ HTTPS /api
Express 5 + TypeScript
      ├── JWT auth + refresh sessions
      ├── CRM / reports / settings
      └── AI provider adapter
              │
       Prisma 7 + PostgreSQL
```

Express serves the compiled Vite app in production, so browser authentication stays same-origin. In development, Vite proxies `/api` to the server on port `4000`.

## Local development

Requirements: Node.js 22.12–24, npm, and PostgreSQL 17+ (or Docker).

1. Install dependencies.

   ```bash
   npm ci
   ```

2. Copy `.env.example` to an untracked `.env`. Replace the database password in `POSTGRES_PASSWORD`, `DATABASE_URL`, and `COMPOSE_DATABASE_URL`, then replace both JWT secrets with different random strings of at least 32 characters.

3. Start PostgreSQL only, if needed.

   ```bash
   docker compose up -d postgres
   ```

4. Apply migrations and start both development servers.

   ```bash
   npm run db:deploy
   npm run dev
   ```

Open `http://localhost:5173`. The API listens on `http://localhost:4000`.

To run the complete production-like stack instead:

```bash
docker compose up --build
```

Then open `http://localhost:4000`.

## Environment

All supported variables are documented in `.env.example`. Important production values are:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: independent high-entropy secrets
- `CORS_ORIGINS`: comma-separated additional browser origins; same-origin traffic is always accepted
- `TRUST_PROXY`: set to `1` behind a single trusted reverse proxy such as Render
- `DEEPSEEK_API_KEY`: optional; required only when a user selects DeepSeek
- `SERVE_STATIC`: set to `true` when Express should serve the built frontend

Never commit `.env` files. The repository ignores every `.env*` file except `.env.example`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite and the API in watch mode |
| `npm run build` | Generate Prisma Client, type-check, and build frontend/server |
| `npm run typecheck` | Type-check frontend and server |
| `npm run lint` | Lint all authored TypeScript |
| `npm test` | Run the backend and browser test suites |
| `npm run test:coverage` | Run all tests with enforced coverage floors |
| `npm run prisma:validate` | Validate the Prisma schema |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed migrations in CI/production |
| `npm start` | Start the compiled production server |

## API surface

Public endpoints:

- `GET /api/health/live`
- `GET /api/health/ready`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/ai/demo` (mock-only and rate-limited)

Bearer-token protected endpoints:

- `GET /api/auth/me`
- `GET|POST /api/leads` (`GET` supports `search`, `status`, `limit`, and `cursor`)
- `PUT|DELETE /api/leads/:id`
- `GET|PUT /api/settings`
- `GET /api/reports/summary`
- `POST /api/ai/research`
- `POST /api/ai/email`

Errors use a consistent `{ "error": { "code", "message", "requestId" } }` envelope. Successful responses use `{ "data": ... }`.

## Deployment

`render.yaml` creates a Docker web service and managed PostgreSQL database, generates authentication secrets, runs migrations in the pre-deploy phase, and checks `/api/health/ready`.

Before a production rollout:

1. Review the selected Render service/database plans and region.
2. Add `DEEPSEEK_API_KEY` in Render only if DeepSeek should be available.
3. Deploy the Blueprint and register the first account through `/register`.
4. Confirm readiness, authentication, CRM CRUD, and AI-provider behavior on the deployed URL.
5. Confirm managed-database backups, retention, alerts, and restore access meet your recovery requirements.

GitHub Actions validates migrations, lint, types, tests, production builds, dependency security, and the Docker image on feature pushes and pull requests.

Operational checks, incident signals, backup expectations, and rollback guidance are documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Screenshots

| Dashboard | CRM |
| --- | --- |
| ![Dashboard](screenshots/dashboard.png) | ![CRM](screenshots/crm.png) |

| AI Research | Email Generator |
| --- | --- |
| ![Research](screenshots/research.png) | ![Email](screenshots/email.png) |

| Reports | Settings |
| --- | --- |
| ![Reports](screenshots/reports.png) | ![Settings](screenshots/settings.png) |

## License

MIT License. See `LICENSE`.
