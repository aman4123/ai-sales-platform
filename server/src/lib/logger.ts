import pino from "pino";
import { env } from "../config/env.js";

export function safeRequestPath(value: string | undefined) {
  if (!value) return "/";
  try {
    return new URL(value, "http://internal").pathname;
  } catch {
    return "/invalid-request-path";
  }
}

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "passwordHash",
      "req.body.password",
      "req.body.token",
      "req.body.recoveryCode",
      "token",
      "accessToken",
      "refreshToken",
      "DEEPSEEK_API_KEY",
      "SMTP_PASSWORD",
      "METRICS_AUTH_TOKEN",
      "verificationUrl",
      "resetUrl",
      "*.password",
      "*.*.password",
    ],
    censor: "[REDACTED]",
  },
});
