import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { resolveAiProvider } from "../ai/ai.routes.js";
import { searchProviderConfiguration } from "../research/search.providers.js";

const shortList = z.array(z.string().trim().min(1).max(500)).max(100);
const statusQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: "custom", path: ["from"], message: "The start date must precede the end date." });
  }
});
const configSchema = z.object({
  mode: z.enum(["MANUAL", "ASSISTED", "AUTONOMOUS"]),
  outreachGoal: z.string().trim().min(5).max(1_000),
  searchLocations: shortList.min(1),
  approvedClaims: shortList.min(1),
  prohibitedClaims: shortList.default([]),
  approvalPolicy: z.object({
    newAudience: z.boolean().default(true),
    firstOutreach: z.boolean().default(true),
    sensitiveReplies: z.boolean().default(true),
    pricing: z.boolean().default(true),
    proposals: z.boolean().default(true),
    contracts: z.boolean().default(true),
  }),
  dailyContactLimit: z.number().int().min(1).max(1_000),
  monthlyContactLimit: z.number().int().min(1).max(100_000),
  maximumFollowUps: z.number().int().min(0).max(10),
  maximumRetries: z.number().int().min(0).max(10),
  quietHours: z.object({
    timezone: z.string().trim().min(1).max(80),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  budgetMinor: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  senderIdentity: z.object({
    name: z.string().trim().min(2).max(120),
    role: z.string().trim().min(2).max(120),
    email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal("")]),
    disclosure: z.string().trim().min(5).max(500),
  }),
  humanMeetingOwner: z.string().trim().min(2).max(160),
}).superRefine((value, context) => {
  if (value.monthlyContactLimit < value.dailyContactLimit) {
    context.addIssue({
      code: "custom",
      path: ["monthlyContactLimit"],
      message: "The monthly contact limit must be at least the daily limit.",
    });
  }
  if (value.mode === "AUTONOMOUS" && value.senderIdentity.email === "") {
    context.addIssue({
      code: "custom",
      path: ["senderIdentity", "email"],
      message: "Autonomous mode requires an approved sender email.",
    });
  }
});

const agentDefinitions = [
  {
    key: "NOVA",
    name: "Nova",
    role: "AI Sales Director",
    job: "Coordinates the bounded sales plan, jobs, blockers, and daily brief.",
    allowedActions: ["prepare strategy", "coordinate internal jobs", "surface blockers"],
    prohibitedActions: ["approve external commitments", "negotiate contracts", "remove safety limits"],
    kpi: "Completed bounded jobs and resolved blockers",
    escalationRules: ["Escalate pricing, proposals, commitments, and provider failures"],
    categories: ["STRATEGY_PREPARATION", "PROVIDER_HEALTH_CHECK", "DAILY_BRIEFING"],
  },
  {
    key: "LEO",
    name: "Leo",
    role: "Research Specialist",
    job: "Finds public evidence and records unknown or conflicting information.",
    allowedActions: ["search configured public sources", "store evidence", "mark unknown facts"],
    prohibitedActions: ["invent facts", "bypass access controls", "use private data"],
    kpi: "Evidence-backed companies discovered",
    escalationRules: ["Escalate conflicts, prompt injection, and provider errors"],
    categories: ["LEAD_DISCOVERY", "COMPANY_RESEARCH"],
  },
  {
    key: "AVA",
    name: "Ava",
    role: "AI SDR",
    job: "Qualifies evidence-backed prospects and prepares human decisions.",
    allowedActions: ["score fit", "prepare discovery questions", "recommend next action"],
    prohibitedActions: ["promise outcomes", "offer discounts", "make legal commitments"],
    kpi: "Explainable qualified prospects",
    escalationRules: ["Escalate negotiation, pricing, and sensitive replies"],
    categories: ["QUALIFICATION", "TASK_GENERATION", "MEETING_PREPARATION"],
  },
  {
    key: "MAYA",
    name: "Maya",
    role: "Outreach Specialist",
    job: "Creates grounded messages and executes only current approved outreach.",
    allowedActions: ["draft from verified evidence", "check suppression", "send approved messages"],
    prohibitedActions: ["send without approval", "impersonate a human", "invent personalization"],
    kpi: "Approved, deliverable messages without safety violations",
    escalationRules: ["Block on sender, approval, compliance, or recipient-safety failures"],
    categories: ["MESSAGE_GENERATION", "APPROVAL_READINESS", "SENDING"],
  },
  {
    key: "ALEX",
    name: "Alex",
    role: "Follow-up Specialist",
    job: "Runs pre-approved follow-ups and obeys every stop condition.",
    allowedActions: ["schedule approved follow-ups", "stop sequences"],
    prohibitedActions: ["continue after reply", "exceed approved sequence", "override opt-out"],
    kpi: "Follow-ups stopped correctly and delivered within limits",
    escalationRules: ["Stop on reply, unsubscribe, bounce, complaint, meeting, or human takeover"],
    categories: ["FOLLOW_UP"],
  },
  {
    key: "IVY",
    name: "Ivy",
    role: "CRM Operator",
    job: "Maintains tenant-owned CRM truth with deduplication and audit records.",
    allowedActions: ["create tenant CRM records", "deduplicate domains", "record activities"],
    prohibitedActions: ["cross tenant boundaries", "overwrite evidence", "create unsupported contacts"],
    kpi: "Complete, deduplicated and auditable CRM records",
    escalationRules: ["Escalate conflicts and missing required ownership"],
    categories: ["CRM_SYNCHRONIZATION", "STALE_OPPORTUNITY_REVIEW"],
  },
  {
    key: "SAGE",
    name: "Sage",
    role: "Reply Analyst",
    job: "Classifies signed inbound events and creates human-response tasks.",
    allowedActions: ["classify replies", "stop future messages", "draft safe recommendations"],
    prohibitedActions: ["auto-negotiate", "accept contracts", "ignore complaints"],
    kpi: "Correct stop decisions and human handoffs",
    escalationRules: ["Escalate objections, pricing, legal, sensitive, and unknown intent"],
    categories: ["INBOUND_WEBHOOK_PROCESSING", "REPLY_CLASSIFICATION"],
  },
  {
    key: "ORION",
    name: "Orion",
    role: "Sales Analyst",
    job: "Reports observed production results separately from test data and estimates.",
    allowedActions: ["aggregate stored events", "report actual costs", "recommend improvements"],
    prohibitedActions: ["fabricate metrics", "merge test and production", "label estimates as actual"],
    kpi: "Truthful funnel and cost reporting",
    escalationRules: ["Surface data gaps and provider confirmation gaps"],
    categories: ["ANALYTICS_AGGREGATION", "DAILY_BRIEFING"],
  },
] as const;

function requireManager(request: { tenant?: { role: string } }) {
  if (!request.tenant || !["TENANT_ADMIN", "SALES_MANAGER"].includes(request.tenant.role)) {
    throw new AppError(403, "SALES_DEPARTMENT_MANAGER_REQUIRED", "Tenant Admin or Sales Manager access is required.");
  }
}

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function jobKey(category: string, value: string) {
  return `${category.toLowerCase()}:${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

async function ensureConfig(database: DatabaseClient, tenantId: string) {
  return database.salesDepartmentConfig.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
  });
}

async function blockers(database: DatabaseClient, tenantId: string, userId: string, mode: string) {
  const [profile, confirmedGoal, settings, budget] = await Promise.all([
    database.companyProfile.findFirst({ where: { tenantId, status: "APPROVED" } }),
    database.salesGoal.findFirst({ where: { tenantId, status: "CONFIRMED" } }),
    database.userSettings.findUnique({ where: { userId } }),
    database.aiBudget.findUnique({ where: { tenantId } }),
  ]);
  const search = searchProviderConfiguration();
  const aiProvider = resolveAiProvider(settings?.aiProvider ?? "MOCK");
  const items: Array<{ code: string; message: string; blocking: boolean }> = [];
  if (!profile) items.push({ code: "COMPANY_PROFILE_REQUIRED", message: "Approve the company profile before starting AI Sales.", blocking: true });
  if (!confirmedGoal) items.push({ code: "SALES_STRATEGY_REQUIRED", message: "Confirm a sales strategy before starting AI Sales.", blocking: true });
  if (!search.configured) items.push({ code: "RESEARCH_PROVIDER_REQUIRED", message: search.message, blocking: true });
  if (aiProvider !== "GROQ") items.push({ code: "AI_DRAFTING_UNAVAILABLE", message: "Groq is not configured and selected; grounded outreach drafting is unavailable.", blocking: false });
  if (budget?.mode === "DISABLED") items.push({ code: "AI_BUDGET_DISABLED", message: "The company AI budget is disabled.", blocking: false });
  const config = await ensureConfig(database, tenantId);
  if (!config.outreachGoal.trim() || config.searchLocations.length === 0 || config.approvedClaims.length === 0 || !config.humanMeetingOwner.trim()) {
    items.push({ code: "DEPARTMENT_CONFIG_REQUIRED", message: "Complete the outreach goal, search locations, approved claims, limits, and human meeting owner.", blocking: true });
  }
  if (mode === "AUTONOMOUS" && (!env.OUTBOUND_EMAIL_ENABLED || env.OUTBOUND_DELIVERY_MODE === "disabled")) {
    items.push({ code: "OUTBOUND_PROVIDER_REQUIRED", message: "Autonomous outreach is unavailable until a safe email delivery mode is configured.", blocking: true });
  }
  if (mode === "AUTONOMOUS" && !config.senderVerified) {
    items.push({ code: "SENDER_VERIFICATION_REQUIRED", message: "Autonomous external outreach requires a verified sender identity and domain.", blocking: true });
  }
  return { items, profile, confirmedGoal, search, aiProvider, budget };
}

export function createSalesDepartmentRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/status", async (request, response) => {
    const tenant = request.tenant!;
    const query = statusQuerySchema.parse(request.query);
    const now = new Date();
    const from = query.from ?? new Date(now.getTime() - 30 * 86_400_000);
    const to = query.to ?? now;
    const createdAt = { gte: from, lte: to };
    const config = await ensureConfig(database, tenant.id);
    const state = await blockers(database, tenant.id, request.user!.id, config.mode);
    const [metrics, recentJobs] = await Promise.all([
      Promise.all([
        database.lead.count({ where: { tenantId: tenant.id, createdAt } }),
        database.researchJob.count({ where: { tenantId: tenant.id, status: "COMPLETED", completedAt: createdAt } }),
        database.lead.count({ where: { tenantId: tenant.id, score: { gte: 60 }, createdAt } }),
        database.campaignMessage.count({ where: { tenantId: tenant.id, status: { in: ["APPROVED", "QUEUED"] }, createdAt } }),
        database.campaignMessage.count({ where: { tenantId: tenant.id, sentAt: createdAt } }),
        database.deliveryEvent.count({ where: { tenantId: tenant.id, type: "DELIVERED", occurredAt: createdAt } }),
        database.reply.count({ where: { tenantId: tenant.id, receivedAt: createdAt } }),
        database.reply.count({ where: { tenantId: tenant.id, classification: "INTERESTED", receivedAt: createdAt } }),
        database.lead.count({ where: { tenantId: tenant.id, status: "MEETING", updatedAt: createdAt } }),
        database.deal.count({ where: { tenantId: tenant.id, stage: { notIn: ["WON", "LOST"] }, deletedAt: null, createdAt } }),
        database.deal.findMany({
          where: { tenantId: tenant.id, stage: "WON", companyId: { not: null }, deletedAt: null, updatedAt: createdAt },
          distinct: ["companyId"],
          select: { companyId: true },
        }),
        database.deal.aggregate({
          where: { tenantId: tenant.id, stage: "WON", currency: config.currency, deletedAt: null, updatedAt: createdAt },
          _sum: { value: true },
        }),
        database.task.count({ where: { tenantId: tenant.id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        database.aiRequest.aggregate({ where: { tenantId: tenant.id, createdAt }, _count: { _all: true }, _sum: { estimatedCostMinor: true } }),
        database.searchUsage.aggregate({ where: { tenantId: tenant.id }, _sum: { count: true } }),
      ]),
      database.automationJob.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const [leads, research, qualified, approvals, sent, delivered, replies, interested, meetings, opportunities, wonCustomerCompanies, revenue, humanActions, aiUsage, searchUsage] = metrics;
    const employees = agentDefinitions.map((agent) => {
      const current = recentJobs.find((job) => agent.categories.includes(job.category as never));
      return {
        ...agent,
        status: current?.status ?? "IDLE",
        currentTask: current ? current.category.replaceAll("_", " ") : null,
        errorState: current?.errorCode ?? null,
        lastJobId: current?.id ?? null,
      };
    });
    response.json({
      data: {
        workspace: { id: tenant.id, name: tenant.name, kind: tenant.kind, dataLabel: tenant.kind === "TEST" ? "TEST" : "REAL" },
        range: { from: from.toISOString(), to: to.toISOString(), label: "Recorded activity in selected range" },
        config,
        canStart: !state.items.some((item) => item.blocking),
        blockers: state.items,
        providers: {
          research: state.search,
          ai: { configured: Boolean(env.GROQ_API_KEY), selected: state.aiProvider, model: env.GROQ_MODEL },
          email: { enabled: env.OUTBOUND_EMAIL_ENABLED, mode: env.OUTBOUND_DELIVERY_MODE },
        },
        metrics: {
          leadsDiscovered: leads,
          leadsVerified: research,
          qualifiedProspects: qualified,
          outreachAwaitingApproval: approvals,
          outreachSent: sent,
          deliveriesConfirmed: delivered,
          replies,
          interestedProspects: interested,
          meetings,
          opportunities,
          wonCustomers: wonCustomerCompanies.length,
          revenue: Number(revenue._sum.value ?? 0),
          revenueCurrency: config.currency,
          humanActions,
          aiRequests: aiUsage._count._all,
          searchRequests: searchUsage._sum.count ?? 0,
          estimatedAiCostMinor: aiUsage._sum.estimatedCostMinor ?? 0,
          externalProviderCostsAvailable: false,
        },
        currentBlocker: state.items[0] ?? null,
        recommendedNextAction: state.items[0]?.message
          ?? (approvals > 0 ? "Review approval-ready outreach." : "Review the latest qualified prospects."),
        employees,
        recentJobs,
      },
    });
  });

  router.put("/config", async (request, response) => {
    requireManager(request);
    const input = configSchema.parse(request.body);
    const tenantId = request.tenant!.id;
    const previous = await ensureConfig(database, tenantId);
    const senderChanged = JSON.stringify(previous.senderIdentity) !== JSON.stringify(input.senderIdentity);
    const config = await database.salesDepartmentConfig.update({
      where: { tenantId },
      data: {
        ...input,
        status: "READY",
        ...(senderChanged ? { senderVerified: false } : {}),
        emergencyStoppedAt: null,
        lastBlockerCode: null,
        lastBlockerMessage: null,
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId,
        action: "SALES_DEPARTMENT_CONFIGURED",
        resourceType: "SalesDepartmentConfig",
        resourceId: config.id,
        requestId: request.id,
        metadata: {
          mode: config.mode,
          dailyContactLimit: config.dailyContactLimit,
          monthlyContactLimit: config.monthlyContactLimit,
          senderVerificationInvalidated: senderChanged,
        },
      },
    });
    response.json({ data: { config } });
  });

  router.post("/start", async (request, response) => {
    requireManager(request);
    z.object({ confirm: z.literal(true) }).parse(request.body);
    const tenantId = request.tenant!.id;
    const config = await ensureConfig(database, tenantId);
    const state = await blockers(database, tenantId, request.user!.id, config.mode);
    const hardBlockers = state.items.filter((item) => item.blocking);
    if (hardBlockers.length > 0) {
      const first = hardBlockers[0]!;
      await database.salesDepartmentConfig.update({
        where: { tenantId },
        data: { status: "BLOCKED", lastBlockerCode: first.code, lastBlockerMessage: first.message },
      });
      throw new AppError(409, first.code, first.message, { blockers: hardBlockers });
    }
    const profile = state.profile!;
    const product = [...profile.products, ...profile.services][0]!;
    const query = [product, "businesses", ...profile.targetIndustries.slice(0, 2), ...config.searchLocations.slice(0, 2)]
      .filter(Boolean)
      .join(" ");
    const now = new Date();
    const jobs = await database.$transaction(async (transaction) => {
      const definitions = [
        { category: "PROVIDER_HEALTH_CHECK" as const, value: `${tenantId}:${dayKey(now)}`, payload: {} },
        { category: "LEAD_DISCOVERY" as const, value: `${tenantId}:${dayKey(now)}:${query}`, payload: { query, targetType: "COMPANY" } },
        { category: "DAILY_BRIEFING" as const, value: `${tenantId}:${dayKey(now)}`, payload: {} },
      ];
      const created = [];
      for (const definition of definitions) {
        const job = await transaction.automationJob.upsert({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: jobKey(definition.category, definition.value) } },
          create: {
            tenantId,
            ownerUserId: request.user!.id,
            category: definition.category,
            idempotencyKey: jobKey(definition.category, definition.value),
            payload: definition.payload,
            maxAttempts: config.maximumRetries + 1,
          },
          update: {},
        });
        created.push(job);
      }
      await transaction.salesDepartmentConfig.update({
        where: { tenantId },
        data: {
          status: "RUNNING",
          lastStartedAt: now,
          lastBlockerCode: null,
          lastBlockerMessage: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          tenantId,
          action: "AI_SALES_STARTED",
          resourceType: "SalesDepartmentConfig",
          resourceId: config.id,
          requestId: request.id,
          metadata: { mode: config.mode, queuedJobIds: created.map((job) => job.id) },
        },
      });
      return created;
    });
    response.status(202).json({ data: { status: "RUNNING", jobs, capabilityWarnings: state.items.filter((item) => !item.blocking) } });
  });

  router.post("/pause", async (request, response) => {
    requireManager(request);
    z.object({ confirm: z.literal(true), reason: z.string().trim().min(5).max(500) }).parse(request.body);
    const tenantId = request.tenant!.id;
    const now = new Date();
    const result = await database.$transaction(async (transaction) => {
      const config = await transaction.salesDepartmentConfig.update({
        where: { tenantId },
        data: { status: "PAUSED", lastPausedAt: now },
      });
      const jobs = await transaction.automationJob.updateMany({
        where: { tenantId, status: { in: ["PENDING", "RETRY_SCHEDULED"] } },
        data: { status: "CANCELLED", cancelRequestedAt: now, cancelledAt: now },
      });
      await transaction.campaign.updateMany({
        where: { tenantId, status: { in: ["SCHEDULED", "RUNNING"] } },
        data: { status: "PAUSED", pausedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          tenantId,
          action: "AI_SALES_PAUSED",
          resourceType: "SalesDepartmentConfig",
          resourceId: config.id,
          requestId: request.id,
          metadata: { pendingJobsCancelled: jobs.count },
        },
      });
      return { config, jobsCancelled: jobs.count };
    });
    response.json({ data: result });
  });

  router.post("/emergency-stop", async (request, response) => {
    requireManager(request);
    const input = z.object({ confirm: z.literal("EMERGENCY STOP"), reason: z.string().trim().min(10).max(500) }).parse(request.body);
    const tenantId = request.tenant!.id;
    const now = new Date();
    const result = await database.$transaction(async (transaction) => {
      const config = await transaction.salesDepartmentConfig.update({
        where: { tenantId },
        data: {
          status: "STOPPED",
          emergencyStoppedAt: now,
          lastBlockerCode: "EMERGENCY_STOP",
          lastBlockerMessage: "A human operator stopped all autonomous work.",
        },
      });
      const jobs = await transaction.automationJob.updateMany({
        where: { tenantId, status: { in: ["PENDING", "RUNNING", "RETRY_SCHEDULED"] } },
        data: { status: "CANCELLED", cancelRequestedAt: now, cancelledAt: now, errorCode: "EMERGENCY_STOP" },
      });
      const messages = await transaction.campaignMessage.updateMany({
        where: { tenantId, status: { in: ["DRAFT", "APPROVED", "QUEUED"] } },
        data: { status: "CANCELLED", cancelledAt: now, failureReason: "EMERGENCY_STOP" },
      });
      await transaction.campaign.updateMany({
        where: { tenantId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: { status: "CANCELLED", pausedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          tenantId,
          action: "AI_SALES_EMERGENCY_STOPPED",
          resourceType: "SalesDepartmentConfig",
          resourceId: config.id,
          requestId: request.id,
          metadata: { reason: input.reason, jobsCancelled: jobs.count, messagesCancelled: messages.count },
        },
      });
      return { config, jobsCancelled: jobs.count, messagesCancelled: messages.count };
    });
    response.json({ data: result });
  });

  router.get("/jobs", async (request, response) => {
    const jobs = await database.automationJob.findMany({
      where: { tenantId: request.tenant!.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    response.json({ data: { jobs } });
  });

  return router;
}
