import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { env } from "../config/env.js";

function secretsMatch(first: string, second: string) {
  const firstHash = createHash("sha256").update(first).digest();
  const secondHash = createHash("sha256").update(second).digest();
  return timingSafeEqual(firstHash, secondHash);
}

export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "ai_sales_" });

  const requests = new Counter({
    name: "ai_sales_http_requests_total",
    help: "Completed HTTP requests.",
    labelNames: ["method", "status"] as const,
    registers: [registry],
  });
  const duration = new Histogram({
    name: "ai_sales_http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "status"] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const inFlight = new Gauge({
    name: "ai_sales_http_requests_in_flight",
    help: "HTTP requests currently being handled.",
    registers: [registry],
  });
  const rateLimited = new Counter({
    name: "ai_sales_rate_limit_rejections_total",
    help: "Requests rejected by a rate limit.",
    labelNames: ["scope"] as const,
    registers: [registry],
  });

  const middleware: RequestHandler = (request, response, next) => {
    if (request.path === "/api/metrics") {
      next();
      return;
    }
    const startedAt = process.hrtime.bigint();
    inFlight.inc();
    response.once("finish", () => {
      const status = String(response.statusCode);
      const method = request.method;
      requests.inc({ method, status });
      duration.observe({ method, status }, Number(process.hrtime.bigint() - startedAt) / 1e9);
      inFlight.dec();
    });
    next();
  };

  const endpoint: RequestHandler = async (request, response) => {
    if (env.METRICS_AUTH_TOKEN) {
      const authorization = request.get("authorization") ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!token || !secretsMatch(token, env.METRICS_AUTH_TOKEN)) {
        response.status(401).json({
          error: {
            code: "METRICS_UNAUTHORIZED",
            message: "A valid metrics bearer token is required.",
            requestId: request.id,
          },
        });
        return;
      }
    }
    response.type(registry.contentType).send(await registry.metrics());
  };

  return {
    middleware,
    endpoint,
    recordRateLimit(scope: "api" | "auth" | "ai") {
      rateLimited.inc({ scope });
    },
  };
}

export type ApplicationMetrics = ReturnType<typeof createMetrics>;
