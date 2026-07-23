import { createServer, type Server } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { createRedisConnection } from "./lib/redis.js";
import { startRetentionJob } from "./jobs/retention.js";

const redis = createRedisConnection();
let server: Server | null = null;
let isShuttingDown = false;
let stopRetentionJob: (() => void) | null = null;

async function disconnectDependencies() {
  await Promise.all([
    prisma.$disconnect(),
    redis?.isOpen ? redis.quit() : Promise.resolve(),
  ]);
}

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  stopRetentionJob?.();
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  if (!server) {
    await disconnectDependencies();
    clearTimeout(forceExit);
    process.exit(0);
  }

  server.close(async (error) => {
    try {
      await disconnectDependencies();
    } finally {
      clearTimeout(forceExit);
      if (error) {
        logger.error({ err: error }, "HTTP server failed to close cleanly");
        process.exit(1);
      }
      logger.info("Graceful shutdown completed");
      process.exit(0);
    }
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "Unhandled promise rejection");
  void shutdown("unhandledRejection");
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException");
});

try {
  await prisma.$connect();
  if (redis) await redis.connect();

  const app = createApp({ database: prisma, redis });
  stopRetentionJob = startRetentionJob(prisma);
  server = createServer(app);
  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV }, "AI Sales API is listening");
  });
} catch (error) {
  logger.fatal({ err: error }, "Failed to start AI Sales API");
  await disconnectDependencies();
  process.exit(1);
}
