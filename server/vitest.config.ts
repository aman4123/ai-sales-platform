import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    env: {
      NODE_ENV: "test",
      PORT: "4000",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/ai_sales_test",
      JWT_ACCESS_SECRET: "test-access-secret-that-is-longer-than-thirty-two-characters",
      JWT_REFRESH_SECRET: "test-refresh-secret-that-is-longer-than-thirty-two-characters",
      JWT_ACCESS_TTL_SECONDS: "900",
      JWT_REFRESH_TTL_SECONDS: "604800",
      BCRYPT_ROUNDS: "4",
      CORS_ORIGINS: "http://localhost:5173",
      SERVE_STATIC: "false",
    },
  },
});
