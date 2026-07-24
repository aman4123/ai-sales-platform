import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalPostgresUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().startsWith("postgresql://").optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SERVE_STATIC: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  DIRECT_URL: optionalPostgresUrl,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  REDIS_URL: optionalUrl,
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  REDIS_CONNECT_RETRIES: z.coerce.number().int().min(0).max(20).default(5),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default("ai-sales-platform"),
  JWT_AUDIENCE: z.string().min(1).default("ai-sales-platform-web"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(3_600)
    .max(31_536_000)
    .default(604_800),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  EMAIL_DELIVERY_MODE: z.enum(["log", "smtp", "resend"]).default("log"),
  EMAIL_FROM: z.string().email().default("no-reply@localhost"),
  EMAIL_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  RESEND_API_KEY: optionalSecret,
  RESEND_API_URL: z.string().url().default("https://api.resend.com"),
  SMTP_HOST: optionalSecret,
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1_025),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: optionalSecret,
  SMTP_PASSWORD: optionalSecret,
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(5).max(10_080).default(1_440),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1_440).default(60),
  RECOVERY_CODE_COUNT: z.coerce.number().int().min(6).max(20).default(8),
  METRICS_AUTH_TOKEN: optionalSecret,
  CORS_ORIGINS: z.string().default(""),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(3_600_000),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  DEEPSEEK_API_KEY: optionalSecret,
  DEEPSEEK_API_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  AI_RESPONSE_MAX_BYTES: z.coerce.number().int().min(1_024).max(1_048_576).default(262_144),
  AI_MAX_TOKENS: z.coerce.number().int().min(64).max(8_192).default(1_500),
  AI_MONTHLY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(1_000_000).default(0),
  AI_HISTORY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(90),
  MAINTENANCE_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(21_600_000),
}).superRefine((configuration, context) => {
  const placeholderPattern = /replace-with|change-me|changeme/i;

  if (configuration.JWT_ACCESS_SECRET === configuration.JWT_REFRESH_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["JWT_REFRESH_SECRET"],
      message: "JWT access and refresh secrets must be different.",
    });
  }

  if (configuration.NODE_ENV === "production") {
    for (const [name, value] of [
      ["JWT_ACCESS_SECRET", configuration.JWT_ACCESS_SECRET],
      ["JWT_REFRESH_SECRET", configuration.JWT_REFRESH_SECRET],
    ] as const) {
      if (placeholderPattern.test(value)) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "Production secrets must not use example placeholder values.",
        });
      }
    }

    if (placeholderPattern.test(new URL(configuration.DATABASE_URL).password)) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "The production database password must not use an example placeholder value.",
      });
    }

    if (!configuration.REDIS_URL) {
      context.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "Production requires Redis for distributed rate limiting and readiness checks.",
      });
    }

    if (new URL(configuration.APP_BASE_URL).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["APP_BASE_URL"],
        message: "The production application URL must use HTTPS.",
      });
    }

    if (configuration.EMAIL_DELIVERY_MODE === "log") {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_DELIVERY_MODE"],
        message: "Production requires SMTP or Resend email delivery.",
      });
    }

    if (configuration.EMAIL_FROM.endsWith("@localhost")) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "Production requires a deliverable email sender address.",
      });
    }

    if (!configuration.METRICS_AUTH_TOKEN || configuration.METRICS_AUTH_TOKEN.length < 32) {
      context.addIssue({
        code: "custom",
        path: ["METRICS_AUTH_TOKEN"],
        message: "Production requires a metrics bearer token of at least 32 characters.",
      });
    }
  }

  if (configuration.REDIS_URL) {
    const redisUrl = new URL(configuration.REDIS_URL);
    const redisProtocol = redisUrl.protocol;
    if (redisProtocol !== "redis:" && redisProtocol !== "rediss:") {
      context.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "Redis URLs must use redis:// or rediss://.",
      });
    }
    if (
      configuration.NODE_ENV === "production" &&
      redisUrl.hostname.endsWith(".upstash.io") &&
      redisProtocol !== "rediss:"
    ) {
      context.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "Production Upstash connections must use rediss:// TLS.",
      });
    }
  }

  const databaseUrl = new URL(configuration.DATABASE_URL);
  if (databaseUrl.hostname.endsWith(".neon.tech")) {
    if (!["require", "verify-full"].includes(databaseUrl.searchParams.get("sslmode") ?? "")) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Neon connections must require TLS with sslmode=require.",
      });
    }
    if (configuration.NODE_ENV === "production" && !configuration.DIRECT_URL) {
      context.addIssue({
        code: "custom",
        path: ["DIRECT_URL"],
        message: "Production Neon deployments require a direct URL for migrations and backups.",
      });
    }
  }

  if (configuration.DIRECT_URL) {
    const directUrl = new URL(configuration.DIRECT_URL);
    if (
      directUrl.hostname.endsWith(".neon.tech") &&
      !["require", "verify-full"].includes(directUrl.searchParams.get("sslmode") ?? "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["DIRECT_URL"],
        message: "The direct Neon connection must require TLS with sslmode=require.",
      });
    }
    if (directUrl.hostname.includes("-pooler.")) {
      context.addIssue({
        code: "custom",
        path: ["DIRECT_URL"],
        message: "DIRECT_URL must use Neon's unpooled hostname.",
      });
    }
  }

  if (Boolean(configuration.SMTP_USER) !== Boolean(configuration.SMTP_PASSWORD)) {
    context.addIssue({
      code: "custom",
      path: ["SMTP_PASSWORD"],
      message: "SMTP_USER and SMTP_PASSWORD must be configured together.",
    });
  }

  if (configuration.EMAIL_DELIVERY_MODE === "smtp" && !configuration.SMTP_HOST) {
    context.addIssue({
      code: "custom",
      path: ["SMTP_HOST"],
      message: "SMTP delivery requires SMTP_HOST.",
    });
  }

  if (
    configuration.EMAIL_DELIVERY_MODE === "resend" &&
    (!configuration.RESEND_API_KEY || configuration.RESEND_API_KEY.length < 20)
  ) {
    context.addIssue({
      code: "custom",
      path: ["RESEND_API_KEY"],
      message: "Resend delivery requires a valid RESEND_API_KEY.",
    });
  }

  for (const origin of configuration.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
        throw new Error("invalid origin");
      }
    } catch {
      context.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: `Invalid browser origin: ${origin}`,
      });
    }
  }

  if (
    configuration.NODE_ENV === "production" &&
    new URL(configuration.DEEPSEEK_API_URL).protocol !== "https:"
  ) {
    context.addIssue({
      code: "custom",
      path: ["DEEPSEEK_API_URL"],
      message: "The production AI provider URL must use HTTPS.",
    });
  }

  if (
    configuration.NODE_ENV === "production" &&
    new URL(configuration.RESEND_API_URL).protocol !== "https:"
  ) {
    context.addIssue({
      code: "custom",
      path: ["RESEND_API_URL"],
      message: "The production Resend API URL must use HTTPS.",
    });
  }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid server configuration: ${issues}`);
}

export const env = result.data;

export const allowedOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
