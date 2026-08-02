import { defineConfig, devices } from "@playwright/test";

const suite = process.env.E2E_SUITE ?? "core";
const databaseUrl = process.env.E2E_DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:5432/ai_sales_e2e_test?schema=public";
const redisUrl = process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6379/15";

function assertIsolatedUrl(raw: string, kind: "database" | "redis") {
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`Playwright ${kind} must use a loopback host.`);
  }
  if (kind === "database" && !/(test|ci)/i.test(url.pathname)) {
    throw new Error("Playwright database name must contain test or ci.");
  }
  if (kind === "redis" && (!url.pathname || url.pathname === "/0")) {
    throw new Error("Playwright must use a dedicated non-zero Redis database.");
  }
}

assertIsolatedUrl(databaseUrl, "database");
assertIsolatedUrl(redisUrl, "redis");

export default defineConfig({
  testDir: "./e2e",
  testMatch: suite === "failures" ? "**/failure-paths.spec.ts" : "**/*.spec.ts",
  testIgnore: suite === "failures" ? undefined : "**/failure-paths.spec.ts",
  fullyParallel: true,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npx tsx scripts/test-provider-fixtures.ts",
      url: "http://127.0.0.1:4399/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev:server",
      url: "http://127.0.0.1:4000/api/health/ready",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "4000",
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_ACCESS_SECRET: "e2e-access-secret-that-is-longer-than-thirty-two-characters",
        JWT_REFRESH_SECRET: "e2e-refresh-secret-that-is-longer-than-thirty-two-characters",
        BCRYPT_ROUNDS: "4",
        CORS_ORIGINS: "http://127.0.0.1:5173",
        APP_BASE_URL: "http://127.0.0.1:5173",
        EMAIL_DELIVERY_MODE: "smtp",
        EMAIL_FROM: "e2e-sender@example.test",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "51025",
        SMTP_SECURE: "false",
        OUTBOUND_EMAIL_ENABLED: "true",
        OUTBOUND_DELIVERY_MODE: "test",
        OUTBOUND_TEST_RECIPIENT: "recipient@example.test",
        OUTBOUND_DAILY_LIMIT: "100",
        EMAIL_WEBHOOK_SECRET: "e2e-webhook-secret-that-is-longer-than-thirty-two-characters",
        GROQ_API_KEY: "testtesttesttest",
        AI_MONTHLY_REQUEST_LIMIT: "100",
        TEST_GROQ_API_URL: "http://127.0.0.1:4399/groq/chat/completions",
        SEARCH_ENABLED: "true",
        SEARCH_PROVIDER: "TAVILY",
        TAVILY_API_KEY: "testtesttesttest",
        SEARCH_MONTHLY_REQUEST_LIMIT: "100",
        TEST_TAVILY_API_URL: "http://127.0.0.1:4399/tavily/search",
        TEST_EMAIL_FAILURE_SUBJECT: "Simulated provider failure",
        MASTER_ADMIN_EMAIL: "master-e2e@example.test",
        TESTER_MODE_ENABLED: "true",
        AUTOMATION_POLL_INTERVAL_MS: "1000",
        RATE_LIMIT_MAX: "100000",
        AUTH_RATE_LIMIT_MAX: "1000",
        AI_RATE_LIMIT_MAX: "1000",
      },
    },
    {
      command: "npm run dev:client -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: suite === "failures"
    ? [{ name: "chromium-failures", use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
        { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
      ],
});
