import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:secure-database-password@database:5432/app",
  REDIS_URL: "rediss://cache.example.com:6379",
  JWT_ACCESS_SECRET: "independent-access-secret-1234567890",
  JWT_REFRESH_SECRET: "independent-refresh-secret-0987654321",
  CORS_ORIGINS: "",
  DEEPSEEK_API_URL: "https://api.deepseek.com",
  APP_BASE_URL: "https://sales.example.com",
  EMAIL_DELIVERY_MODE: "smtp",
  EMAIL_FROM: "no-reply@sales.example.com",
  SMTP_HOST: "smtp.example.com",
  METRICS_AUTH_TOKEN: "independent-metrics-token-1234567890",
};

function applyEnvironment(overrides: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...productionEnvironment, ...overrides })) {
    vi.stubEnv(name, value);
  }
}

describe("production environment validation", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts independent secrets and secure provider URLs", async () => {
    applyEnvironment();
    await expect(import("./env.js")).resolves.toHaveProperty("env.NODE_ENV", "production");
  });

  it("rejects copied placeholders and shared signing secrets", async () => {
    applyEnvironment({
      DATABASE_URL: "postgresql://app:replace-with-a-password@database:5432/app",
      JWT_ACCESS_SECRET: "replace-with-a-shared-secret-value",
      JWT_REFRESH_SECRET: "replace-with-a-shared-secret-value",
    });

    await expect(import("./env.js")).rejects.toThrow(
      /placeholder values|must be different/,
    );
  });

  it("accepts TLS Neon, Upstash, and Resend free-tier configuration", async () => {
    applyEnvironment({
      DATABASE_URL:
        "postgresql://app:secure-database-password@ep-example-pooler.us-east-1.aws.neon.tech/app?sslmode=require&channel_binding=require",
      DIRECT_URL:
        "postgresql://app:secure-database-password@ep-example.us-east-1.aws.neon.tech/app?sslmode=require&channel_binding=require",
      REDIS_URL: "rediss://default:secure-redis-password@free-cache.upstash.io:6379",
      EMAIL_DELIVERY_MODE: "resend",
      EMAIL_FROM: "onboarding@resend.dev",
      RESEND_API_KEY: "test-resend-api-key-with-safe-length",
      SMTP_HOST: "",
    });

    await expect(import("./env.js")).resolves.toMatchObject({
      env: {
        EMAIL_DELIVERY_MODE: "resend",
        HOST: "0.0.0.0",
      },
    });
  });

  it("normalizes a Redis URL copied as an environment assignment", async () => {
    const redisUrl = "rediss://default:secure-redis-password@free-cache.upstash.io:6379";
    applyEnvironment({ REDIS_URL: `REDIS_URL="${redisUrl}"\n` });

    const configuration = await import("./env.js");

    expect(configuration.env.REDIS_URL).toBe(redisUrl);
  });

  it("rejects insecure or incomplete free-tier provider configuration", async () => {
    applyEnvironment({
      DATABASE_URL:
        "postgresql://app:secure-database-password@ep-example-pooler.us-east-1.aws.neon.tech/app",
      DIRECT_URL:
        "postgresql://app:secure-database-password@ep-example-pooler.us-east-1.aws.neon.tech/app",
      REDIS_URL: "redis://default:secure-redis-password@free-cache.upstash.io:6379",
      EMAIL_DELIVERY_MODE: "resend",
      RESEND_API_KEY: "",
      SMTP_HOST: "",
    });

    await expect(import("./env.js")).rejects.toThrow(
      /sslmode=require|unpooled|rediss:\/\/ TLS|RESEND_API_KEY/,
    );
  });
});
