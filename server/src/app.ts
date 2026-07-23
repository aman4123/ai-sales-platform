import { existsSync } from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { allowedOrigins, env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import type { DatabaseClient } from "./lib/prisma.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import {
  aiRateLimit,
  apiRateLimit,
  requestId,
} from "./middleware/request-security.js";
import { createAiRouter, createDemoAiRouter } from "./modules/ai/ai.routes.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { createLeadRouter } from "./modules/leads/lead.routes.js";
import { createReportRouter } from "./modules/reports/report.routes.js";
import { createSettingsRouter } from "./modules/settings/settings.routes.js";

interface AppOptions {
  database: DatabaseClient;
  serveStatic?: boolean;
}

export function createApp({ database, serveStatic }: AppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== "test",
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    }),
  );
  app.use(helmet());
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

  app.use("/api", apiRateLimit);
  app.use("/api/health", createHealthRouter(database));
  app.use("/api/auth", createAuthRouter(database));
  app.use("/api/ai/demo", aiRateLimit, createDemoAiRouter());
  app.use("/api/leads", requireAuth, createLeadRouter(database));
  app.use("/api/settings", requireAuth, createSettingsRouter(database));
  app.use("/api/reports", requireAuth, createReportRouter(database));
  app.use("/api/ai", requireAuth, aiRateLimit, createAiRouter(database));

  app.use("/api", notFoundHandler);

  const shouldServeStatic = serveStatic ?? env.SERVE_STATIC;
  const frontendDirectory = path.resolve(process.cwd(), "dist");

  if (shouldServeStatic && existsSync(frontendDirectory)) {
    app.use(express.static(frontendDirectory, { index: false, maxAge: "1h" }));
    app.use((request, response, next) => {
      if (request.method === "GET" && request.accepts("html")) {
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
