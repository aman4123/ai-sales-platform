import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:secure-database-password@database:5432/app",
  JWT_ACCESS_SECRET: "independent-access-secret-1234567890",
  JWT_REFRESH_SECRET: "independent-refresh-secret-0987654321",
  CORS_ORIGINS: "",
  DEEPSEEK_API_URL: "https://api.deepseek.com",
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
});
