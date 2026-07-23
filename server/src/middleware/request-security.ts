import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

export const requestId: RequestHandler = (request, response, next) => {
  const suppliedId = request.header("x-request-id");
  const id = suppliedId && /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID();

  request.id = id;
  response.setHeader("x-request-id", id);
  next();
};

function rateLimitHandler(message: string): RequestHandler {
  return (request, response) => {
    response.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message,
        requestId: request.id,
      },
    });
  };
}

export const apiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (request) => request.path.startsWith("/health"),
  handler: rateLimitHandler("Too many requests. Please try again later."),
});

export const authRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler("Too many authentication attempts. Please try again later."),
});

export const aiRateLimit = rateLimit({
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  limit: env.AI_RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (request) =>
    request.user?.id ?? ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? "unknown"),
  handler: rateLimitHandler("AI request limit reached. Please try again later."),
});
