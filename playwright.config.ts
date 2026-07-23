import { defineConfig, devices } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:5432/ai_sales_test?schema=public";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:server",
      url: "http://127.0.0.1:4000/api/health/ready",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "4000",
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: "e2e-access-secret-that-is-longer-than-thirty-two-characters",
        JWT_REFRESH_SECRET: "e2e-refresh-secret-that-is-longer-than-thirty-two-characters",
        BCRYPT_ROUNDS: "4",
        CORS_ORIGINS: "http://127.0.0.1:5173",
        APP_BASE_URL: "http://127.0.0.1:5173",
        EMAIL_DELIVERY_MODE: "log",
        RATE_LIMIT_MAX: "100000",
        AUTH_RATE_LIMIT_MAX: "1000",
        AI_RATE_LIMIT_MAX: "1000",
      },
    },
    {
      command: "npm run dev:client -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
