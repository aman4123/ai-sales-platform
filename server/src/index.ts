import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const app = createApp({ database: prisma });
const server = createServer(app);
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    try {
      await prisma.$disconnect();
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
  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV }, "AI Sales API is listening");
  });
} catch (error) {
  logger.fatal({ err: error }, "Failed to start AI Sales API");
  await prisma.$disconnect();
  process.exit(1);
}
