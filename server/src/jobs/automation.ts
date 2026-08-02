import type { Prisma } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { DatabaseClient } from "../lib/prisma.js";
import type { RedisClient } from "../lib/redis.js";
import { generateDailyBrief } from "../modules/operations/operations.routes.js";
import {
  evidenceConfidence,
  evidenceConflicts,
  evidenceFromSearch,
  supportedResearchFields,
  type GroundingEvidence,
} from "../modules/research/research.grounding.js";
import { searchProviderConfiguration } from "../modules/research/search.providers.js";
import { executeVerifiedSearch } from "../modules/research/search.service.js";

type AutomationJobRecord = Awaited<ReturnType<DatabaseClient["automationJob"]["findFirst"]>>;

const supportedCategories = [
  "LEAD_DISCOVERY",
  "QUALIFICATION",
  "CRM_SYNCHRONIZATION",
  "DAILY_BRIEFING",
  "ANALYTICS_AGGREGATION",
  "STALE_OPPORTUNITY_REVIEW",
  "PROVIDER_HEALTH_CHECK",
] as const;

function payloadObject(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function evidenceValue(evidence: GroundingEvidence[], field: (typeof supportedResearchFields)[number]) {
  return evidence.find((item) => item.field === field)?.value ?? null;
}

function unknownFields(evidence: GroundingEvidence[]) {
  const known = new Set(evidence.map((item) => item.field));
  return supportedResearchFields.filter((field) => !known.has(field));
}

async function enqueueJob(
  database: DatabaseClient,
  input: {
    tenantId: string;
    ownerUserId: string;
    category: "QUALIFICATION" | "CRM_SYNCHRONIZATION";
    idempotencyKey: string;
    payload: Prisma.InputJsonValue;
    maxAttempts: number;
  },
) {
  return database.automationJob.upsert({
    where: {
      tenantId_idempotencyKey: {
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    create: input,
    update: {},
  });
}

async function processDiscovery(
  database: DatabaseClient,
  redis: RedisClient | null,
  job: NonNullable<AutomationJobRecord>,
) {
  const payload = payloadObject(job.payload);
  const query = typeof payload.query === "string" ? payload.query : "";
  if (query.length < 3) throw new Error("AUTOMATION_QUERY_INVALID");

  let researchJob = await database.researchJob.findFirst({
    where: { tenantId: job.tenantId, query, createdAt: { gte: job.createdAt } },
    orderBy: { createdAt: "asc" },
    include: { results: true },
  });
  if (researchJob?.status === "COMPLETED") {
    return { researchJobId: researchJob.id, results: researchJob.results.length, reused: true };
  }
  if (researchJob && researchJob.status !== "RUNNING") {
    researchJob = await database.researchJob.update({
      where: { id: researchJob.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        completedAt: null,
        error: null,
        errorCode: null,
        attemptCount: { increment: 1 },
        timeoutAt: new Date(Date.now() + job.timeoutMs),
      },
      include: { results: true },
    });
  }
  researchJob ??= await database.researchJob.create({
    data: {
      tenantId: job.tenantId,
      userId: job.ownerUserId,
      query,
      targetType: "COMPANY",
      provider: searchProviderConfiguration().provider,
      status: "RUNNING",
      startedAt: new Date(),
      attemptCount: 1,
      maxAttempts: job.maxAttempts,
      timeoutAt: new Date(Date.now() + job.timeoutMs),
    },
    include: { results: true },
  });

  try {
    const search = await executeVerifiedSearch(
      database,
      redis,
      job.ownerUserId,
      query,
      job.tenantId,
    );
    const grounded = evidenceFromSearch(search);
    const createdResults = [];
    for (const candidate of grounded.candidates) {
      const conflicts = evidenceConflicts(candidate.evidence);
      const result = await database.companyResearchResult.create({
        data: {
          tenantId: job.tenantId,
          userId: job.ownerUserId,
          jobId: researchJob.id,
          companyName: evidenceValue(candidate.evidence, "companyName"),
          website: evidenceValue(candidate.evidence, "website"),
          domain: evidenceValue(candidate.evidence, "domain"),
          industry: evidenceValue(candidate.evidence, "industry"),
          description: evidenceValue(candidate.evidence, "description"),
          headquarters: evidenceValue(candidate.evidence, "headquarters"),
          publicPhone: evidenceValue(candidate.evidence, "publicPhone"),
          publicEmail: evidenceValue(candidate.evidence, "publicEmail"),
          unknownFields: unknownFields(candidate.evidence),
          confidenceScore: evidenceConfidence(candidate.evidence),
          riskFlags: [
            "REQUIRES_CONFIRMATION",
            ...grounded.riskFlags,
            ...(conflicts.length > 0 ? ["CONFLICTING_SOURCES"] : []),
          ],
          staleAt: new Date(Date.now() + 30 * 86_400_000),
          salesAnalysis: {
            label: "Evidence-only autonomous discovery",
            statements: [],
            rejectedUnsupportedFacts: 0,
          },
          evidence: {
            create: candidate.evidence.map((item) => ({
              id: item.id,
              tenantId: job.tenantId,
              field: item.field,
              value: item.value,
              sourceUrl: item.sourceUrl,
              sourceTitle: item.sourceTitle,
              sourceType: item.sourceType,
              retrievedAt: item.retrievedAt,
              confidence: item.confidence,
              verificationStatus: item.verificationStatus,
              ...(item.quotedSnippet ? { quotedSnippet: item.quotedSnippet } : {}),
              isPrimarySource: item.isPrimarySource,
            })),
          },
        },
      });
      createdResults.push(result);
      await enqueueJob(database, {
        tenantId: job.tenantId,
        ownerUserId: job.ownerUserId,
        category: "QUALIFICATION",
        idempotencyKey: `qualification:${result.id}`,
        payload: { researchResultId: result.id },
        maxAttempts: job.maxAttempts,
      });
    }
    await database.researchJob.update({
      where: { id: researchJob.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return { researchJobId: researchJob.id, results: createdResults.length, cached: search.cached };
  } catch (error) {
    await database.researchJob.update({
      where: { id: researchJob.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCode: error instanceof Error ? error.message.slice(0, 80) : "RESEARCH_FAILED",
        error: "Verified research could not be completed.",
      },
    });
    throw error;
  }
}

async function processQualification(database: DatabaseClient, job: NonNullable<AutomationJobRecord>) {
  const payload = payloadObject(job.payload);
  const researchResultId = typeof payload.researchResultId === "string" ? payload.researchResultId : "";
  const [result, profile] = await Promise.all([
    database.companyResearchResult.findFirst({
      where: { id: researchResultId, tenantId: job.tenantId },
      include: { evidence: true },
    }),
    database.companyProfile.findUnique({ where: { tenantId: job.tenantId } }),
  ]);
  if (!result || !profile) throw new Error("QUALIFICATION_INPUT_MISSING");

  const evidenceQuality = Math.max(0, Math.min(1, result.confidenceScore / 100));
  const verifiedEvidence = result.evidence.filter((item) => item.verificationStatus === "VERIFIED").length;
  const normalizedIndustry = result.industry?.toLowerCase() ?? "";
  const industryFit = profile.targetIndustries.some((target) => {
    const normalized = target.toLowerCase();
    return normalizedIndustry.length > 0
      && normalized.length > 0
      && (normalizedIndustry.includes(normalized) || normalized.includes(normalizedIndustry));
  });
  const excluded = profile.exclusions.some((exclusion) => {
    const normalized = exclusion.toLowerCase();
    return (result.companyName?.toLowerCase().includes(normalized) ?? false)
      || (result.domain?.toLowerCase().includes(normalized) ?? false)
      || normalizedIndustry.includes(normalized);
  });
  const score = excluded
    ? 0
    : Math.min(100, Math.round(evidenceQuality * 60) + Math.min(20, verifiedEvidence * 4) + (industryFit ? 20 : 0));
  const reasons = {
    evidenceQuality,
    verifiedEvidence,
    industryFit,
    excluded,
    explanation: excluded
      ? "The prospect matched an approved exclusion."
      : "Score combines stored evidence confidence, verified evidence count, and approved industry fit.",
  };
  await database.companyResearchResult.update({
    where: { id: result.id },
    data: {
      salesAnalysis: {
        label: "Explainable deterministic qualification",
        score,
        reasons,
        inference: true,
      },
      riskFlags: [...new Set([...result.riskFlags, ...(excluded ? ["APPROVED_EXCLUSION"] : [])])],
    },
  });
  if (!excluded && result.companyName) {
    await enqueueJob(database, {
      tenantId: job.tenantId,
      ownerUserId: job.ownerUserId,
      category: "CRM_SYNCHRONIZATION",
      idempotencyKey: `crm:${result.id}`,
      payload: { researchResultId: result.id, score, reasons },
      maxAttempts: job.maxAttempts,
    });
  }
  return { researchResultId: result.id, score, excluded, reasons };
}

async function processCrmSync(database: DatabaseClient, job: NonNullable<AutomationJobRecord>) {
  const payload = payloadObject(job.payload);
  const researchResultId = typeof payload.researchResultId === "string" ? payload.researchResultId : "";
  const score = typeof payload.score === "number" ? payload.score : 0;
  const reasons = payload.reasons && typeof payload.reasons === "object" ? payload.reasons : {};
  const result = await database.companyResearchResult.findFirst({
    where: { id: researchResultId, tenantId: job.tenantId },
  });
  if (!result?.companyName) throw new Error("CRM_INPUT_MISSING");

  let company = result.domain
    ? await database.company.findFirst({ where: { tenantId: job.tenantId, domain: result.domain } })
    : null;
  company ??= await database.company.create({
    data: {
      tenantId: job.tenantId,
      userId: job.ownerUserId,
      name: result.companyName,
      legalName: result.legalName,
      aliases: result.aliases,
      website: result.website,
      domain: result.domain,
      industry: result.industry,
      description: result.description,
      headquarters: result.headquarters,
      operatingLocations: result.operatingLocations,
      publicPhone: result.publicPhone,
      publicEmail: result.publicEmail,
      ...(result.socialProfiles !== null
        ? { socialProfiles: result.socialProfiles as Prisma.InputJsonValue }
        : {}),
      ...(result.registrationIdentifiers !== null
        ? { registrationIdentifiers: result.registrationIdentifiers as Prisma.InputJsonValue }
        : {}),
      productsServices: result.productsServices,
      confidenceScore: result.confidenceScore,
      riskFlags: result.riskFlags,
      staleAt: result.staleAt,
    },
  });
  await database.companyResearchResult.update({
    where: { id: result.id },
    data: { companyId: company.id },
  });
  const existingLead = await database.lead.findFirst({
    where: { tenantId: job.tenantId, companyRecordId: company.id },
  });
  const lead = existingLead ?? await database.lead.create({
    data: {
      tenantId: job.tenantId,
      userId: job.ownerUserId,
      company: result.companyName,
      contact: result.publicEmail ? "Public business contact (name not verified)" : "Contact not publicly available",
      email: result.publicEmail,
      industry: result.industry,
      status: "INTERESTED",
      notes: "Created from stored public evidence by the bounded CRM synchronization job.",
      companyRecordId: company.id,
      score,
      scoreReasons: reasons as Prisma.InputJsonValue,
      evidenceQuality: Math.max(0, Math.min(1, result.confidenceScore / 100)),
      confidence: Math.max(0, Math.min(1, result.confidenceScore / 100)),
      riskFlags: result.riskFlags,
      lastResearchedAt: result.updatedAt,
    },
  });
  await database.auditLog.create({
    data: {
      actorUserId: job.ownerUserId,
      tenantId: job.tenantId,
      action: "AUTONOMOUS_CRM_SYNCHRONIZED",
      resourceType: "Lead",
      resourceId: lead.id,
      metadata: { automationJobId: job.id, researchResultId: result.id, companyId: company.id, score },
    },
  });
  return { companyId: company.id, leadId: lead.id, score, duplicate: Boolean(existingLead) };
}

async function processProviderHealth(database: DatabaseClient, job: NonNullable<AutomationJobRecord>) {
  const search = searchProviderConfiguration();
  const budget = await database.aiBudget.findUnique({ where: { tenantId: job.tenantId } });
  return {
    research: { provider: search.provider, configured: search.configured, enabled: search.enabled },
    ai: { configured: Boolean(env.GROQ_API_KEY), model: env.GROQ_MODEL, budgetMode: budget?.mode ?? "DISABLED" },
    email: { enabled: env.OUTBOUND_EMAIL_ENABLED, mode: env.OUTBOUND_DELIVERY_MODE },
    checkedAt: new Date().toISOString(),
    liveProviderRequestPerformed: false,
  };
}

async function processAnalytics(database: DatabaseClient, job: NonNullable<AutomationJobRecord>) {
  const [departmentConfig, tenant] = await Promise.all([
    database.salesDepartmentConfig.findUnique({ where: { tenantId: job.tenantId }, select: { currency: true } }),
    database.tenant.findUnique({ where: { id: job.tenantId }, select: { kind: true } }),
  ]);
  const currency = departmentConfig?.currency ?? "USD";
  const [leads, sent, replies, opportunities, revenue] = await Promise.all([
    database.lead.count({ where: { tenantId: job.tenantId } }),
    database.campaignMessage.count({ where: { tenantId: job.tenantId, sentAt: { not: null } } }),
    database.reply.count({ where: { tenantId: job.tenantId } }),
    database.deal.count({ where: { tenantId: job.tenantId, stage: { notIn: ["WON", "LOST"] } } }),
    database.deal.aggregate({ where: { tenantId: job.tenantId, stage: "WON", currency }, _sum: { value: true } }),
  ]);
  return {
    dataLabel: tenant?.kind === "TEST" ? "TEST" : "REAL",
    leads,
    sent,
    replies,
    opportunities,
    revenue: Number(revenue._sum.value ?? 0),
    revenueCurrency: currency,
  };
}

async function processStaleOpportunities(database: DatabaseClient, job: NonNullable<AutomationJobRecord>) {
  const stale = await database.deal.findMany({
    where: {
      tenantId: job.tenantId,
      stage: { notIn: ["WON", "LOST"] },
      expectedAt: { lt: new Date() },
      deletedAt: null,
    },
    take: 50,
  });
  let created = 0;
  for (const deal of stale) {
    const existing = await database.task.findFirst({
      where: {
        tenantId: job.tenantId,
        type: "GENERAL",
        status: { in: ["OPEN", "IN_PROGRESS"] },
        description: { contains: deal.id },
      },
    });
    if (existing) continue;
    await database.task.create({
      data: {
        tenantId: job.tenantId,
        userId: job.ownerUserId,
        type: "GENERAL",
        title: "Review stale opportunity",
        description: `Opportunity ${deal.id} passed its expected close date and needs a human next action.`,
      },
    });
    created += 1;
  }
  return { reviewed: stale.length, tasksCreated: created };
}

export async function executeAutomationJob(
  database: DatabaseClient,
  redis: RedisClient | null,
  job: NonNullable<AutomationJobRecord>,
) {
  switch (job.category) {
    case "LEAD_DISCOVERY": return processDiscovery(database, redis, job);
    case "QUALIFICATION": return processQualification(database, job);
    case "CRM_SYNCHRONIZATION": return processCrmSync(database, job);
    case "DAILY_BRIEFING": {
      const brief = await generateDailyBrief(database, job.tenantId, job.ownerUserId);
      return { briefId: brief.id, dataLabel: brief.dataLabel, generatedAt: brief.generatedAt.toISOString() };
    }
    case "ANALYTICS_AGGREGATION": return processAnalytics(database, job);
    case "STALE_OPPORTUNITY_REVIEW": return processStaleOpportunities(database, job);
    case "PROVIDER_HEALTH_CHECK": return processProviderHealth(database, job);
    default: throw new Error("JOB_CATEGORY_NOT_IMPLEMENTED");
  }
}

export async function claimAutomationJob(database: DatabaseClient) {
  const candidate = await database.automationJob.findFirst({
    where: {
      category: { in: [...supportedCategories] },
      OR: [
        { status: "PENDING", scheduledAt: { lte: new Date() } },
        { status: "RETRY_SCHEDULED", nextAttemptAt: { lte: new Date() } },
      ],
      cancelRequestedAt: null,
      tenant: { status: "ACTIVE", salesDepartment: { status: "RUNNING" } },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;
  const claimed = await database.automationJob.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      cancelRequestedAt: null,
    },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      attemptCount: { increment: 1 },
      errorCode: null,
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) return null;
  return database.automationJob.findUnique({ where: { id: candidate.id } });
}

export async function runAutomationJob(
  database: DatabaseClient,
  redis: RedisClient | null,
  job: NonNullable<AutomationJobRecord>,
) {
  try {
    const result = await Promise.race([
      executeAutomationJob(database, redis, job),
      new Promise<never>((_resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("JOB_TIMEOUT")), job.timeoutMs);
        timeout.unref();
      }),
    ]);
    await database.$transaction([
      database.automationJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          resultSummary: result as Prisma.InputJsonValue,
        },
      }),
      database.auditLog.create({
        data: {
          actorUserId: job.ownerUserId,
          tenantId: job.tenantId,
          action: "AUTOMATION_JOB_COMPLETED",
          resourceType: "AutomationJob",
          resourceId: job.id,
          metadata: { category: job.category, attemptCount: job.attemptCount },
        },
      }),
    ]);
  } catch (error) {
    const retry = job.attemptCount < job.maxAttempts;
    const errorCode = error instanceof Error ? error.message.slice(0, 80) : "JOB_FAILED";
    const retryDelay = Math.min(3_600_000, 5_000 * 2 ** Math.max(0, job.attemptCount - 1));
    await database.$transaction([
      database.automationJob.update({
        where: { id: job.id },
        data: {
          status: retry ? "RETRY_SCHEDULED" : "FAILED",
          errorCode,
          errorMessage: "The bounded automation job could not be completed.",
          nextAttemptAt: retry ? new Date(Date.now() + retryDelay) : null,
          completedAt: retry ? null : new Date(),
        },
      }),
      database.auditLog.create({
        data: {
          actorUserId: job.ownerUserId,
          tenantId: job.tenantId,
          action: retry ? "AUTOMATION_JOB_RETRY_SCHEDULED" : "AUTOMATION_JOB_FAILED",
          resourceType: "AutomationJob",
          resourceId: job.id,
          metadata: { category: job.category, errorCode, attemptCount: job.attemptCount },
        },
      }),
    ]);
    logger.warn({ automationJobId: job.id, category: job.category, errorCode, retry }, "Automation job failed safely");
  }
}

export function startAutomationWorker(database: DatabaseClient, redis: RedisClient | null) {
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const job = await claimAutomationJob(database);
      if (job) await runAutomationJob(database, redis, job);
    } catch (error) {
      logger.error({ err: error }, "Automation worker tick failed");
    } finally {
      running = false;
    }
  };
  const interval = setInterval(() => void tick(), env.AUTOMATION_POLL_INTERVAL_MS);
  interval.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
