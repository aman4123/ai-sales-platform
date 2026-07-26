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

    const [sessions, accountTokens, aiRequests, settings] = await Promise.all([
      transaction.refreshSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      transaction.accountToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      transaction.aiRequest.deleteMany({ where: { createdAt: { lt: aiCutoff } } }),
      transaction.userSettings.findMany({
        select: { userId: true, dataRetentionDays: true },
        orderBy: { userId: "asc" },
        take: 1_000,
      }),
    ]);
    let researchJobs = 0;
    let deliveryEvents = 0;
    let replyPreviewsCleared = 0;
    for (const setting of settings) {
      const cutoff = new Date(now.getTime() - setting.dataRetentionDays * 86_400_000);
      const [research, delivery, replies] = await Promise.all([
        transaction.researchJob.deleteMany({ where: { userId: setting.userId, createdAt: { lt: cutoff } } }),
        transaction.deliveryEvent.deleteMany({ where: { userId: setting.userId, createdAt: { lt: cutoff } } }),
        transaction.reply.updateMany({
          where: { userId: setting.userId, receivedAt: { lt: cutoff }, contentPreview: { not: null } },
          data: { contentPreview: null },
        }),
      ]);
      researchJobs += research.count;
      deliveryEvents += delivery.count;
      replyPreviewsCleared += replies.count;
    }
    return {
      sessions: sessions.count,
      accountTokens: accountTokens.count,
      aiRequests: aiRequests.count,
      researchJobs,
      deliveryEvents,
      replyPreviewsCleared,
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
