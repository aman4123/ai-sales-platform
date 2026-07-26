import { Router } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { searchProviderConfiguration } from "../research/search.providers.js";

export function createAdminRouter(database: DatabaseClient) {
  const router = Router();

  router.post("/demo-data", async (request, response) => {
    if (request.user?.accountRole !== "SUPER_ADMIN" || request.user.accessMode !== "TESTER") {
      throw new AppError(
        403,
        "TESTER_MODE_REQUIRED",
        "Switch to Tester Mode before loading isolated demo data.",
      );
    }
    const userId = request.user.id;
    const result = await database.$transaction(async (transaction) => {
      const company = await transaction.company.upsert({
        where: { userId_domain: { userId, domain: "northstar-logistics.demo.invalid" } },
        create: {
          userId,
          name: "Northstar Logistics (Demo)",
          domain: "northstar-logistics.demo.invalid",
          industry: "Logistics",
          description: "Clearly labeled tester data for exercising V2 workflows.",
          confidenceScore: 0,
          riskFlags: ["TEST_DATA", "NOT_VERIFIED"],
        },
        update: {},
      });
      const contact = await transaction.contact.upsert({
        where: { userId_publicEmail: { userId, publicEmail: "jordan@northstar.demo.invalid" } },
        create: {
          userId,
          companyId: company.id,
          name: "Jordan Lee (Demo)",
          jobTitle: "Operations Lead (Demo)",
          publicEmail: "jordan@northstar.demo.invalid",
          verificationStatus: "UNVERIFIED",
        },
        update: { companyId: company.id },
      });
      const existingLead = await transaction.lead.findFirst({
        where: { userId, companyRecordId: company.id, contactRecordId: contact.id },
      });
      const lead = existingLead ?? await transaction.lead.create({
        data: {
          userId,
          company: company.name,
          contact: contact.name,
          email: contact.publicEmail,
          industry: company.industry,
          status: "INTERESTED",
          notes: "Tester Mode demo record. Do not use for real outreach.",
          companyRecordId: company.id,
          contactRecordId: contact.id,
          riskFlags: ["TEST_DATA", "NOT_VERIFIED"],
        },
      });
      const existingDeal = await transaction.deal.findFirst({
        where: { userId, companyId: company.id, contactId: contact.id, name: "Demo workflow review" },
      });
      const deal = existingDeal ?? await transaction.deal.create({
        data: {
          userId,
          companyId: company.id,
          contactId: contact.id,
          name: "Demo workflow review",
          stage: "QUALIFYING",
          value: 0,
          currency: "USD",
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: userId,
          action: "TESTER_DEMO_DATA_READY",
          resourceType: "TesterWorkspace",
          requestId: request.id,
          metadata: { companyId: company.id, contactId: contact.id, leadId: lead.id, dealId: deal.id },
        },
      });
      return { companyId: company.id, contactId: contact.id, leadId: lead.id, dealId: deal.id };
    });
    response.status(201).json({ data: { ...result, isolatedToUserId: userId } });
  });

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
