import "dotenv/config";
import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
  AI_HISTORY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(90),
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
