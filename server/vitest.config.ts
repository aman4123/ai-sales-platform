import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/server",
      include: ["server/src/**/*.ts"],
      exclude: [
        "server/src/**/*.test.ts",
        "server/src/generated/**",
        "server/src/types/**",
        "server/src/index.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 86,
        lines: 81,
      },
    },
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: "4000",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/ai_sales_test",
      JWT_ACCESS_SECRET:
        process.env.JWT_ACCESS_SECRET ??
        "test-access-secret-that-is-longer-than-thirty-two-characters",
      JWT_REFRESH_SECRET:
        process.env.JWT_REFRESH_SECRET ??
        "test-refresh-secret-that-is-longer-than-thirty-two-characters",
      JWT_ACCESS_TTL_SECONDS: "900",
      JWT_REFRESH_TTL_SECONDS: "604800",
      BCRYPT_ROUNDS: "4",
      AUTH_RATE_LIMIT_MAX: "1000",
      CORS_ORIGINS: "http://localhost:5173",
      SERVE_STATIC: "false",
      DEEPSEEK_API_KEY: "test-provider-key",
      AI_MONTHLY_REQUEST_LIMIT: "2",
      METRICS_AUTH_TOKEN: "test-metrics-token-that-is-longer-than-thirty-two-characters",
    },
  },
});
