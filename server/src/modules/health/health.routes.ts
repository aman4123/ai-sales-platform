import { Router } from "express";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";

export function createHealthRouter(database: DatabaseClient, redis: RedisClient | null) {
  const router = Router();

  router.get("/live", (_request, response) => {
    response.json({ data: { status: "ok" } });
  });

  router.get("/ready", async (_request, response) => {
    try {
      await database.$queryRaw`SELECT 1`;
      if (redis) await redis.ping();
      response.json({
        data: {
          status: "ready",
          dependencies: { database: "ok", redis: redis ? "ok" : "disabled" },
        },
      });
    } catch {
      response.status(503).json({
        error: {
          code: "NOT_READY",
          message: "A required service dependency is unavailable.",
          requestId: _request.id,
        },
      });
    }
  });

  return router;
}
