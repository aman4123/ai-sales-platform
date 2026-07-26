import { Router } from "express";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { searchProviderConfiguration } from "../research/search.providers.js";

export function createAdminRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/overview", async (request, response) => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [users, activeSessionCount, aiRequests, searchUsage, sentMessages, failedJobs, complaints, campaigns] =
      await Promise.all([
        database.user.count(),
        database.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(DISTINCT "userId")::int AS count
          FROM "RefreshSession"
          WHERE "revokedAt" IS NULL AND "expiresAt" > NOW()
        `,
        database.aiRequest.count({ where: { createdAt: { gte: monthStart } } }),
        database.searchUsage.aggregate({ where: { updatedAt: { gte: monthStart } }, _sum: { count: true } }),
        database.campaignMessage.count({ where: { sentAt: { gte: monthStart } } }),
        database.researchJob.count({ where: { status: "FAILED", createdAt: { gte: monthStart } } }),
        database.optOut.count({ where: { source: "COMPLAINT", createdAt: { gte: monthStart } } }),
        database.campaign.groupBy({ by: ["status"], _count: { _all: true } }),
      ]);
    const auditLogs = await database.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        requestId: true,
        createdAt: true,
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "ADMIN_OVERVIEW_VIEWED",
        resourceType: "AdminDashboard",
        requestId: request.id,
      },
    });
    response.json({
      data: {
        users,
        activeUsers: activeSessionCount[0]?.count ?? 0,
        aiRequests,
        searchRequests: searchUsage._sum.count ?? 0,
        emailSends: sentMessages,
        failedJobs,
        providerHealth: {
          search: searchProviderConfiguration(),
          ai: { provider: "GROQ", configured: Boolean(env.GROQ_API_KEY) },
          email: { provider: env.EMAIL_DELIVERY_MODE, outboundEnabled: env.OUTBOUND_EMAIL_ENABLED },
        },
        monthlyBudget: {
          aiRequests: env.AI_MONTHLY_REQUEST_LIMIT,
          searchRequests: env.SEARCH_MONTHLY_REQUEST_LIMIT,
          outboundDailyLimit: env.OUTBOUND_DAILY_LIMIT,
        },
        abuseFlags: complaints,
        campaignActivity: Object.fromEntries(campaigns.map((item) => [item.status, item._count._all])),
        auditLogs,
      },
    });
  });

  return router;
}
