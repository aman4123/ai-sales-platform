import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import type { ApplicationMetrics } from "../lib/metrics.js";
import type { RedisClient } from "../lib/redis.js";

export const requestId: RequestHandler = (request, response, next) => {
  const suppliedId = request.header("x-request-id");
  const id = suppliedId && /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID();
  request.id = id;
  response.setHeader("x-request-id", id);
  next();
};

function redisStore(redis: RedisClient | null, prefix: string): Store | undefined {
  if (!redis) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => redis.sendCommand(args),
  });
}

function rateLimitHandler(
  message: string,
  scope: "api" | "auth" | "ai",
  metrics: ApplicationMetrics,
): RequestHandler {
  return (request, response) => {
    metrics.recordRateLimit(scope);
    response.status(429).json({
      error: { code: "RATE_LIMITED", message, requestId: request.id },
    });
  };
}

export function createRateLimiters(redis: RedisClient | null, metrics: ApplicationMetrics) {
  const apiStore = redisStore(redis, "rl:api:");
  const authStore = redisStore(redis, "rl:auth:");
  const aiStore = redisStore(redis, "rl:ai:");
  return {
    api: rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      ...(apiStore ? { store: apiStore } : {}),
      skip: (request) => request.path.startsWith("/health") || request.path === "/metrics",
      handler: rateLimitHandler("Too many requests. Please try again later.", "api", metrics),
    }),
    auth: rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.AUTH_RATE_LIMIT_MAX,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      ...(authStore ? { store: authStore } : {}),
      handler: rateLimitHandler(
        "Too many authentication attempts. Please try again later.",
        "auth",
        metrics,
      ),
    }),
    ai: rateLimit({
      windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
      limit: env.AI_RATE_LIMIT_MAX,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      ...(aiStore ? { store: aiStore } : {}),
      keyGenerator: (request) =>
        request.user?.id ?? ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? "unknown"),
      handler: rateLimitHandler("AI request limit reached. Please try again later.", "ai", metrics),
    }),
  };
}

export type RequestRateLimiters = ReturnType<typeof createRateLimiters>;
