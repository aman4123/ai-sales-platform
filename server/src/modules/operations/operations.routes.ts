import { Router } from "express";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { tenantScope } from "../tenancy/tenant.service.js";

const idSchema = z.string().min(1).max(64);

function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function generateDailyBrief(
  database: DatabaseClient,
  tenantId: string,
  _fallbackUserId: string,
  now = new Date(),
) {
  const dayStart = utcDayStart(now);
  const scope = { tenantId };
  const departmentDelegate = (database as unknown as { salesDepartmentConfig?: { findUnique?: unknown } }).salesDepartmentConfig;
  const departmentConfig = typeof departmentDelegate?.findUnique === "function"
    ? await database.salesDepartmentConfig.findUnique({ where: { tenantId }, select: { currency: true } })
    : null;
  const currency = departmentConfig?.currency ?? "USD";
  const [
    leadsDiscovered,
    researchCompleted,
    qualifiedLeads,
    outreachSent,
    repliesReceived,
    interestedProspects,
    meetings,
    opportunitiesCreated,
    pipeline,
    failedResearch,
    openApprovals,
    openHumanTasks,
    complaints,
    bounces,
    deliveriesConfirmed,
    wonCustomers,
    revenue,
    aiUsage,
    searchUsage,
  ] = await Promise.all([
    database.lead.count({ where: { ...scope, createdAt: { gte: dayStart } } }),
    database.researchJob.count({
      where: { ...scope, status: "COMPLETED", completedAt: { gte: dayStart } },
    }),
    database.lead.count({
      where: { ...scope, score: { gte: 60 }, updatedAt: { gte: dayStart } },
    }),
    database.campaignMessage.count({
      where: { ...scope, sentAt: { gte: dayStart } },
    }),
    database.reply.count({
      where: { ...scope, receivedAt: { gte: dayStart } },
    }),
    database.reply.count({
      where: {
        ...scope,
        receivedAt: { gte: dayStart },
        classification: "INTERESTED",
      },
    }),
    database.lead.count({ where: { ...scope, status: "MEETING", updatedAt: { gte: dayStart } } }),
    database.deal.count({ where: { ...scope, createdAt: { gte: dayStart } } }),
    database.deal.aggregate({
      where: { ...scope, stage: { notIn: ["WON", "LOST"] }, currency, deletedAt: null },
      _sum: { value: true },
    }),
    database.researchJob.count({
      where: { ...scope, status: "FAILED", createdAt: { gte: dayStart } },
    }),
    database.campaign.count({
      where: { ...scope, status: "READY_FOR_REVIEW", deletedAt: null },
    }),
    database.task.count({
      where: { ...scope, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    database.optOut.count({
      where: { ...scope, source: "COMPLAINT", createdAt: { gte: dayStart } },
    }),
    database.deliveryEvent.count({
      where: { ...scope, type: "BOUNCED", createdAt: { gte: dayStart } },
    }),
    database.deliveryEvent.count({
      where: { ...scope, type: "DELIVERED", createdAt: { gte: dayStart } },
    }),
    database.deal.findMany({
      where: { ...scope, stage: "WON", companyId: { not: null }, updatedAt: { gte: dayStart }, deletedAt: null },
      distinct: ["companyId"],
      select: { companyId: true },
    }),
    database.deal.aggregate({
      where: { ...scope, stage: "WON", currency, updatedAt: { gte: dayStart }, deletedAt: null },
      _sum: { value: true },
    }),
    database.aiRequest.aggregate({
      where: { ...scope, createdAt: { gte: dayStart } },
      _count: { _all: true },
      _sum: { estimatedCostMinor: true },
    }),
    database.searchUsage.aggregate({ where: scope, _sum: { count: true } }),
  ]);

  const failures = [
    ...(failedResearch > 0 ? [`${failedResearch} research job(s) failed today.`] : []),
    ...(bounces > 0 ? [`${bounces} message(s) bounced today.`] : []),
  ];
  const risks = [
    ...(complaints > 0 ? [`${complaints} complaint suppression event(s) require review.`] : []),
    ...(openHumanTasks > 0 ? [`${openHumanTasks} human task(s) remain open.`] : []),
  ];
  const approvals = [
    ...(openApprovals > 0 ? [`${openApprovals} campaign(s) await review.`] : []),
  ];
  const priorities = openApprovals > 0
    ? ["Review approval-ready campaigns before starting new outreach."]
    : openHumanTasks > 0
      ? ["Resolve human-response and data-quality tasks."]
      : researchCompleted === 0
        ? ["Research and qualify the next target account."]
        : ["Review qualified leads and prepare grounded outreach."];
  const metrics = {
    leadsDiscovered,
    researchCompleted,
    qualifiedLeads,
    outreachSent,
    repliesReceived,
    interestedProspects,
    meetings,
    opportunitiesCreated,
    pipelineValue: Number(pipeline._sum.value ?? 0),
    deliveriesConfirmed,
    wonCustomers: wonCustomers.length,
    revenue: Number(revenue._sum.value ?? 0),
    revenueCurrency: currency,
    aiRequests: aiUsage._count._all,
    searchRequestsRecorded: searchUsage._sum.count ?? 0,
    estimatedAiCostMinor: aiUsage._sum.estimatedCostMinor ?? 0,
    externalProviderCostsAvailable: false,
  };

  const tenantDelegate = (database as unknown as { tenant?: { findUnique?: unknown } }).tenant;
  const tenant = typeof tenantDelegate?.findUnique === "function"
    ? await database.tenant.findUnique({ where: { id: tenantId }, select: { kind: true } })
    : null;
  const dataLabel = tenant?.kind === "TEST" ? "TEST" : "REAL";

  return database.dailySalesBrief.upsert({
    where: { tenantId_briefDate: { tenantId, briefDate: dayStart } },
    create: {
      tenantId,
      briefDate: dayStart,
      metrics,
      failures,
      risks,
      approvals,
      priorities,
      dataLabel,
      generatedAt: now,
    },
    update: {
      metrics,
      failures,
      risks,
      approvals,
      priorities,
      dataLabel,
      generatedAt: now,
    },
  });
}

export function createOperationsRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/tasks", async (request, response) => {
    const status = z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional().parse(request.query.status);
    const tasks = await database.task.findMany({
      where: { ...tenantScope(request.tenant, request.user!.id), ...(status ? { status } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    response.json({ data: { tasks } });
  });

  router.put("/tasks/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = z
      .object({ status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) })
      .parse(request.body);
    const task = await database.task.findFirst({ where: { id, ...tenantScope(request.tenant, request.user!.id) } });
    if (!task) throw new NotFoundError("Task");
    const updated = await database.task.update({
      where: { id, ...tenantScope(request.tenant, request.user!.id) },
      data: {
        status: input.status,
        completedAt: input.status === "COMPLETED" ? new Date() : null,
      },
    });
    response.json({ data: { task: updated } });
  });

  router.get("/inbox", async (request, response) => {
    const requiresHuman = z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true"))
      .parse(request.query.requiresHuman);
    const replies = await database.reply.findMany({
      where: {
        ...tenantScope(request.tenant, request.user!.id),
        ...(requiresHuman === undefined ? {} : { requiresHuman }),
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: {
        recipient: {
          select: {
            id: true,
            status: true,
            campaign: { select: { id: true, name: true } },
            contact: { select: { name: true, jobTitle: true } },
            lead: { select: { contact: true, company: true } },
          },
        },
      },
    });
    response.json({ data: { replies } });
  });

  router.get("/analytics", async (request, response) => {
    const userId = request.user!.id;
    const scope = tenantScope(request.tenant, userId);
    const [researchJobs, verifiedLeads, recipients, messageGroups, replies, optedOut, humanTasks, campaigns] =
      await Promise.all([
        database.researchJob.count({ where: { ...scope, status: "COMPLETED" } }),
        database.lead.count({ where: { ...scope, confidence: { gt: 0 } } }),
        database.campaignRecipient.count({ where: scope }),
        database.campaignMessage.groupBy({
          by: ["status"],
          where: scope,
          _count: { _all: true },
        }),
        database.reply.count({ where: scope }),
        database.optOut.count({ where: scope }),
        database.task.count({ where: { ...scope, type: "HUMAN_RESPONSE_REQUIRED", status: { not: "COMPLETED" } } }),
        database.campaign.groupBy({
          by: ["status"],
          where: { ...scope, deletedAt: null },
          _count: { _all: true },
        }),
      ]);
    const messages = Object.fromEntries(messageGroups.map((item) => [item.status, item._count._all]));
    const sent = Number(messages.SENT ?? 0) + Number(messages.DELIVERED ?? 0);
    response.json({
      data: {
        researchedLeads: researchJobs,
        verifiedLeads,
        approvedRecipients: recipients,
        emailsQueued: Number(messages.QUEUED ?? 0),
        emailsSent: sent,
        delivered: Number(messages.DELIVERED ?? 0),
        bounced: Number(messages.BOUNCED ?? 0),
        replied: replies,
        optedOut,
        humanTakeoverRequired: humanTasks,
        campaigns: Object.fromEntries(campaigns.map((item) => [item.status, item._count._all])),
        responseRate: sent > 0 ? replies / sent : 0,
        positiveResponseRate: null,
        unavailableMetrics: [
          "Email opens are unavailable until provider tracking is configured.",
          "Link clicks are unavailable until provider tracking is configured.",
          "Positive response rate requires manual reply classification.",
        ],
      },
    });
  });

  router.get("/daily-brief", async (request, response) => {
    if (!request.tenant) {
      throw new NotFoundError("Company workspace");
    }
    const brief = await generateDailyBrief(
      database,
      request.tenant.id,
      request.user!.id,
    );
    response.json({ data: { brief } });
  });

  router.post("/daily-brief/generate", async (request, response) => {
    z.object({ confirm: z.literal(true) }).parse(request.body);
    if (!request.tenant) {
      throw new NotFoundError("Company workspace");
    }
    const brief = await generateDailyBrief(
      database,
      request.tenant.id,
      request.user!.id,
    );
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId: request.tenant.id,
        action: "DAILY_SALES_BRIEF_GENERATED",
        resourceType: "DailySalesBrief",
        resourceId: brief.id,
        requestId: request.id,
        metadata: { dataLabel: "REAL", briefDate: brief.briefDate.toISOString() },
      },
    });
    response.json({ data: { brief } });
  });

  return router;
}
