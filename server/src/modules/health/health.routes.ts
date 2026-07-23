import { Router } from "express";
import type { DatabaseClient } from "../../lib/prisma.js";

export function createHealthRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/live", (_request, response) => {
    response.json({ data: { status: "ok" } });
  });

  router.get("/ready", async (_request, response) => {
    await database.$queryRaw`SELECT 1`;
    response.json({ data: { status: "ready" } });
  });

  return router;
}
