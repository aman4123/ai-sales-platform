import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env.js";
import type { DatabaseClient } from "../lib/prisma.js";
import type { RedisClient } from "../lib/redis.js";
import {
  claimAutomationJob,
  executeAutomationJob,
  runAutomationJob,
  startAutomationWorker,
} from "./automation.js";

const now = new Date("2026-08-02T12:00:00.000Z");

function job(category: string, payload: unknown = {}) {
  return {
    id: `job-${category.toLowerCase()}`,
    tenantId: "tenant-1",
    ownerUserId: "owner-1",
    category,
    status: "RUNNING",
    idempotencyKey: `key-${category}`,
    payload,
    resultSummary: null,
    errorCode: null,
    errorMessage: null,
    attemptCount: 1,
    maxAttempts: 3,
    timeoutMs: 5_000,
    scheduledAt: now,
    nextAttemptAt: null,
    startedAt: now,
    completedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function researchResult() {
  return {
    id: "result-1",
    tenantId: "tenant-1",
    userId: "owner-1",
    jobId: "research-1",
    companyId: null,
    companyName: "Northstar Logistics",
    legalName: null,
    aliases: [],
    website: "https://northstar-logistics.example",
    domain: "northstar-logistics.example",
    industry: "Logistics",
    description: "Public logistics coordination services.",
    headquarters: null,
    operatingLocations: [],
    publicPhone: null,
    publicEmail: null,
    socialProfiles: null,
    registrationIdentifiers: null,
    productsServices: ["Logistics coordination"],
    unknownFields: [],
    confidenceScore: 75,
    riskFlags: ["REQUIRES_CONFIRMATION"],
    salesAnalysis: null,
    staleAt: null,
    createdAt: now,
    updatedAt: now,
    evidence: [
      { id: "evidence-1", verificationStatus: "VERIFIED" },
      { id: "evidence-2", verificationStatus: "VERIFIED" },
    ],
  };
}

function fixture() {
  const result = researchResult();
  const methods = {
    automationJob: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(job("PROVIDER_HEALTH_CHECK")),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(async ({ create }) => ({ id: `queued-${create.category}`, ...create })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    researchJob: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "research-1", status: "RUNNING", results: [] }),
      update: vi.fn().mockResolvedValue({ id: "research-1", status: "COMPLETED", results: [] }),
      count: vi.fn().mockResolvedValue(1),
    },
    companyResearchResult: {
      findFirst: vi.fn().mockResolvedValue(result),
      create: vi.fn(async ({ data }) => ({ id: "discovered-result", ...data })),
      update: vi.fn().mockResolvedValue(result),
    },
    companyProfile: {
      findUnique: vi.fn().mockResolvedValue({
        targetIndustries: ["Logistics"],
        exclusions: ["Consumer gambling"],
      }),
    },
    company: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ id: "company-1", ...data })),
    },
    lead: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ id: "lead-1", ...data })),
      count: vi.fn().mockResolvedValue(2),
    },
    aiBudget: { findUnique: vi.fn().mockResolvedValue({ mode: "INTERNAL_UNLIMITED" }) },
    salesDepartmentConfig: { findUnique: vi.fn().mockResolvedValue({ currency: "USD" }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ kind: "TEST" }) },
    campaignMessage: { count: vi.fn().mockResolvedValue(3) },
    reply: { count: vi.fn().mockResolvedValue(1) },
    deal: {
      count: vi.fn().mockResolvedValue(1),
      aggregate: vi.fn().mockResolvedValue({ _sum: { value: 500 } }),
      findMany: vi.fn().mockResolvedValue([
        { id: "deal-stale", expectedAt: new Date("2026-07-01T00:00:00.000Z") },
        { id: "deal-reviewed", expectedAt: new Date("2026-07-02T00:00:00.000Z") },
      ]),
    },
    task: {
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: "task-existing" }),
      create: vi.fn().mockResolvedValue({ id: "task-1" }),
    },
    campaign: { count: vi.fn().mockResolvedValue(1) },
    optOut: { count: vi.fn().mockResolvedValue(0) },
    deliveryEvent: { count: vi.fn().mockResolvedValue(1) },
    aiRequest: { aggregate: vi.fn().mockResolvedValue({ _count: { _all: 2 }, _sum: { estimatedCostMinor: 4 } }) },
    searchUsage: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { count: 2 } }),
      upsert: vi.fn().mockResolvedValue({ id: "usage-1" }),
    },
    dailySalesBrief: {
      upsert: vi.fn().mockResolvedValue({ id: "brief-1", dataLabel: "TEST", generatedAt: now }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const database = {
    ...methods,
    $transaction: vi.fn(async (actions) => Array.isArray(actions) ? Promise.all(actions) : actions(methods)),
  } as unknown as DatabaseClient;
  return { database, methods, result };
}

describe("bounded automation execution", () => {
  const originalSearchEnabled = env.SEARCH_ENABLED;
  const originalSearchKey = env.TAVILY_API_KEY;
  const originalSearchBudget = env.SEARCH_MONTHLY_REQUEST_LIMIT;

  afterEach(() => {
    env.SEARCH_ENABLED = originalSearchEnabled;
    env.TAVILY_API_KEY = originalSearchKey;
    env.SEARCH_MONTHLY_REQUEST_LIMIT = originalSearchBudget;
  });

  it("executes provider, analytics, stale-opportunity, qualification, CRM, and daily-brief jobs", async () => {
    const { database, methods, result } = fixture();

    await expect(executeAutomationJob(database, null, job("PROVIDER_HEALTH_CHECK") as never)).resolves.toMatchObject({
      ai: { budgetMode: "INTERNAL_UNLIMITED" },
      liveProviderRequestPerformed: false,
    });
    await expect(executeAutomationJob(database, null, job("ANALYTICS_AGGREGATION") as never)).resolves.toMatchObject({
      dataLabel: "TEST",
      revenue: 500,
      revenueCurrency: "USD",
    });
    await expect(executeAutomationJob(database, null, job("STALE_OPPORTUNITY_REVIEW") as never)).resolves.toEqual({ reviewed: 2, tasksCreated: 1 });
    await expect(executeAutomationJob(database, null, job("QUALIFICATION", { researchResultId: result.id }) as never)).resolves.toMatchObject({
      score: 73,
      excluded: false,
      reasons: { evidenceQuality: 0.75, industryFit: true },
    });
    await expect(executeAutomationJob(database, null, job("CRM_SYNCHRONIZATION", { researchResultId: result.id, score: 73, reasons: { industryFit: true } }) as never)).resolves.toMatchObject({
      companyId: "company-1",
      leadId: "lead-1",
      duplicate: false,
    });
    expect(methods.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ confidence: 0.75, evidenceQuality: 0.75 }),
    }));
    await expect(executeAutomationJob(database, null, job("DAILY_BRIEFING") as never)).resolves.toMatchObject({ briefId: "brief-1", dataLabel: "TEST" });
  });

  it("discovers evidence from a cached provider result and schedules qualification exactly once", async () => {
    const { database, methods } = fixture();
    env.SEARCH_ENABLED = true;
    env.TAVILY_API_KEY = "configured-test-key";
    env.SEARCH_MONTHLY_REQUEST_LIMIT = 10;
    const cached = {
      provider: "TAVILY",
      query: "logistics businesses India",
      retrievedAt: now.toISOString(),
      results: [{
        title: "Northstar Logistics",
        url: "https://northstar-logistics.example",
        snippet: "Northstar Logistics provides public logistics coordination services.",
      }],
    };
    const redis = { sendCommand: vi.fn().mockResolvedValue(JSON.stringify(cached)) } as unknown as RedisClient;

    await expect(executeAutomationJob(database, redis, job("LEAD_DISCOVERY", { query: cached.query }) as never)).resolves.toMatchObject({
      researchJobId: "research-1",
      results: 1,
      cached: true,
    });
    expect(methods.companyResearchResult.create).toHaveBeenCalled();
    expect(methods.automationJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ category: "QUALIFICATION" }),
    }));
    expect(methods.researchJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("reuses completed discovery, rejects invalid jobs, and persists safe retry state", async () => {
    const { database, methods } = fixture();
    methods.researchJob.findFirst.mockResolvedValueOnce({ id: "research-existing", status: "COMPLETED", results: [{ id: "one" }] } as never);
    await expect(executeAutomationJob(database, null, job("LEAD_DISCOVERY", { query: "valid query" }) as never)).resolves.toEqual({
      researchJobId: "research-existing",
      results: 1,
      reused: true,
    });
    await expect(executeAutomationJob(database, null, job("LEAD_DISCOVERY", { query: "" }) as never)).rejects.toThrow("AUTOMATION_QUERY_INVALID");
    await expect(executeAutomationJob(database, null, job("STRATEGY_PREPARATION") as never)).rejects.toThrow("JOB_CATEGORY_NOT_IMPLEMENTED");

    await runAutomationJob(database, null, job("STRATEGY_PREPARATION") as never);
    expect(methods.automationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "RETRY_SCHEDULED", errorCode: "JOB_CATEGORY_NOT_IMPLEMENTED" }),
    }));
    await runAutomationJob(database, null, { ...job("STRATEGY_PREPARATION"), attemptCount: 3 } as never);
    expect(methods.automationJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
    await runAutomationJob(database, null, job("PROVIDER_HEALTH_CHECK") as never);
    expect(methods.automationJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("claims work atomically and exposes a stoppable polling worker", async () => {
    const { database, methods } = fixture();
    const candidate = { ...job("PROVIDER_HEALTH_CHECK"), status: "PENDING" };
    methods.automationJob.findFirst.mockResolvedValueOnce(candidate as never).mockResolvedValue(null);
    methods.automationJob.findUnique.mockResolvedValueOnce({ ...candidate, status: "RUNNING" } as never);
    await expect(claimAutomationJob(database)).resolves.toMatchObject({ id: candidate.id, status: "RUNNING" });

    const stop = startAutomationWorker(database, null);
    await vi.waitFor(() => expect(methods.automationJob.findFirst).toHaveBeenCalled());
    stop();
  });
});
