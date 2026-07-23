import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { DatabaseClient } from "../lib/prisma.js";

const RETENTION_LOCK_ID = 2_026_072_301;

export async function runRetention(database: DatabaseClient) {
  const now = new Date();
  const aiCutoff = new Date(now.getTime() - env.AI_HISTORY_RETENTION_DAYS * 86_400_000);
  return database.$transaction(async (transaction) => {
    const [lock] = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${RETENTION_LOCK_ID}) AS acquired
    `;
    if (!lock?.acquired) return null;

    const [sessions, accountTokens, aiRequests] = await Promise.all([
      transaction.refreshSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      transaction.accountToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      transaction.aiRequest.deleteMany({ where: { createdAt: { lt: aiCutoff } } }),
    ]);
    return {
      sessions: sessions.count,
      accountTokens: accountTokens.count,
      aiRequests: aiRequests.count,
    };
  });
}

export function startRetentionJob(database: DatabaseClient) {
  const execute = async () => {
    try {
      const deleted = await runRetention(database);
      if (deleted && Object.values(deleted).some((count) => count > 0)) {
        logger.info({ deleted }, "Expired data retention completed");
      }
    } catch (error) {
      logger.error({ err: error }, "Expired data retention failed");
    }
  };

  void execute();
  const timer = setInterval(() => void execute(), env.MAINTENANCE_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
