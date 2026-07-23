import { existsSync } from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { allowedOrigins, env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { createEmailService, type EmailService } from "./lib/email.js";
import { logger, safeRequestPath } from "./lib/logger.js";
import { createMetrics } from "./lib/metrics.js";
import type { DatabaseClient } from "./lib/prisma.js";
import type { RedisClient } from "./lib/redis.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createRateLimiters, requestId } from "./middleware/request-security.js";
import { createAiRouter, createDemoAiRouter } from "./modules/ai/ai.routes.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { createLeadRouter } from "./modules/leads/lead.routes.js";
import { createReportRouter } from "./modules/reports/report.routes.js";
import { createSettingsRouter } from "./modules/settings/settings.routes.js";

interface AppOptions {
  database: DatabaseClient;
  redis?: RedisClient | null;
  emailService?: EmailService;
  serveStatic?: boolean;
}

export function createApp({ database, redis = null, emailService, serveStatic }: AppOptions) {
  const app = express();
  const metrics = createMetrics();
  const rateLimiters = createRateLimiters(redis, metrics);
  const accountEmail = emailService ?? createEmailService();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(requestId);
  app.use(metrics.middleware);
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== "test",
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
      serializers: {
        req: (request: {
          id?: string;
          method?: string;
          url?: string;
          host?: string;
          remoteAddress?: string;
          remotePort?: number;
        }) => ({
          id: request.id,
          method: request.method,
          url: safeRequestPath(request.url),
          host: request.host,
          remoteAddress: request.remoteAddress,
          remotePort: request.remotePort,
        }),
      },
      customProps: (request) => ({ requestId: request.id }),
      customLogLevel: (_request, response, error) => {
        if (error || response.statusCode >= 500) return "error";
        if (response.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(compression({ threshold: 1_024 }));
  app.use(
    cors((request, callback) => {
      const origin = request.get("origin");
      const sameOrigin = `${request.protocol}://${request.get("host")}`;

      if (!origin || origin === sameOrigin || allowedOrigins.includes(origin)) {
        callback(null, { credentials: true, origin: true });
        return;
      }

      callback(new AppError(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed."));
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/metrics", metrics.endpoint);
  app.use("/api", rateLimiters.api);
  app.use("/api/health", createHealthRouter(database, redis));
  app.use("/api/auth", createAuthRouter(database, accountEmail, rateLimiters));
  app.use("/api/ai/demo", rateLimiters.ai, createDemoAiRouter());
  app.use("/api/leads", requireAuth, createLeadRouter(database));
  app.use("/api/settings", requireAuth, createSettingsRouter(database));
  app.use("/api/reports", requireAuth, createReportRouter(database));
  app.use("/api/ai", requireAuth, rateLimiters.ai, createAiRouter(database));

  app.use("/api", notFoundHandler);

  const shouldServeStatic = serveStatic ?? env.SERVE_STATIC;
  const frontendDirectory = path.resolve(process.cwd(), "dist");

  if (shouldServeStatic && existsSync(frontendDirectory)) {
    app.use(
      "/assets",
      express.static(path.join(frontendDirectory, "assets"), {
        immutable: true,
        index: false,
        maxAge: "1y",
      }),
    );
    app.use(express.static(frontendDirectory, { index: false, maxAge: "1h" }));
    app.use((request, response, next) => {
      if (request.method === "GET" && request.accepts("html")) {
        response.setHeader("cache-control", "no-cache");
        response.sendFile(path.join(frontendDirectory, "index.html"));
        return;
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
