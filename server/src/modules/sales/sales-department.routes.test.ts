import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createSalesDepartmentRouter } from "./sales-department.routes.js";

const config = {
  id: "department-1",
  tenantId: "tenant-1",
  mode: "MANUAL",
  status: "READY",
  outreachGoal: "Find businesses that need an AI Sales Department.",
  searchLocations: ["India"],
  approvedClaims: ["Evidence-backed research"],
  prohibitedClaims: ["Guaranteed revenue"],
  approvalPolicy: { newAudience: true, firstOutreach: true, sensitiveReplies: true, pricing: true, proposals: true, contracts: true },
  dailyContactLimit: 5,
  monthlyContactLimit: 50,
  maximumFollowUps: 2,
  maximumRetries: 2,
  quietHours: { timezone: "Asia/Kolkata", start: "18:00", end: "09:00" },
  budgetMinor: 0,
  currency: "USD",
  senderIdentity: { name: "Ava", role: "AI Sales Representative", email: "ava@example.test", disclosure: "AI representative working with the sales team." },
  senderVerified: false,
  humanMeetingOwner: "Founding sales owner",
  emergencyStoppedAt: null,
  lastStartedAt: null,
  lastPausedAt: null,
  lastBlockerCode: null,
  lastBlockerMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const configInput = {
  mode: "MANUAL",
  outreachGoal: config.outreachGoal,
  searchLocations: config.searchLocations,
  approvedClaims: config.approvedClaims,
  prohibitedClaims: config.prohibitedClaims,
  approvalPolicy: config.approvalPolicy,
  dailyContactLimit: config.dailyContactLimit,
  monthlyContactLimit: config.monthlyContactLimit,
  maximumFollowUps: config.maximumFollowUps,
  maximumRetries: config.maximumRetries,
  quietHours: config.quietHours,
  budgetMinor: config.budgetMinor,
  currency: config.currency,
  senderIdentity: config.senderIdentity,
  humanMeetingOwner: config.humanMeetingOwner,
};

function fixture(profileAvailable = true) {
  const profile = profileAvailable ? {
    id: "profile-1",
    products: ["Autonomous AI Sales Department"],
    services: [],
    targetIndustries: ["B2B services"],
  } : null;
  const methods = {
    salesDepartmentConfig: {
      upsert: vi.fn().mockResolvedValue(config),
      update: vi.fn(async ({ data }) => ({ ...config, ...data })),
    },
    companyProfile: { findFirst: vi.fn().mockResolvedValue(profile) },
    salesGoal: { findFirst: vi.fn().mockResolvedValue({ id: "goal-1", status: "CONFIRMED" }) },
    userSettings: { findUnique: vi.fn().mockResolvedValue({ aiProvider: "GROQ" }) },
    aiBudget: { findUnique: vi.fn().mockResolvedValue({ mode: "LIMITED", monthlyRequestLimit: 10 }) },
    lead: { count: vi.fn().mockResolvedValue(2) },
    researchJob: { count: vi.fn().mockResolvedValue(1) },
    campaignMessage: { count: vi.fn().mockResolvedValue(1), updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    deliveryEvent: { count: vi.fn().mockResolvedValue(1) },
    reply: { count: vi.fn().mockResolvedValue(1) },
    deal: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([{ companyId: "company-1" }]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { value: 1200 } }),
    },
    task: { count: vi.fn().mockResolvedValue(1) },
    aiRequest: { aggregate: vi.fn().mockResolvedValue({ _count: { _all: 3 }, _sum: { estimatedCostMinor: 4 } }) },
    searchUsage: { aggregate: vi.fn().mockResolvedValue({ _sum: { count: 2 } }) },
    automationJob: {
      findMany: vi.fn().mockResolvedValue([{ id: "job-existing", category: "LEAD_DISCOVERY", status: "COMPLETED", errorCode: null }]),
      upsert: vi.fn(async ({ create }) => ({ id: `job-${create.category}`, status: "PENDING", ...create })),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    campaign: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const database = {
    ...methods,
    $transaction: vi.fn(async (operation) => Array.isArray(operation) ? Promise.all(operation) : operation(methods)),
  } as unknown as DatabaseClient;
  return { database, methods };
}

function appFor(database: DatabaseClient, role = "TENANT_ADMIN") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.id = "request-1";
    req.user = { id: "owner-1", email: "owner@example.test", role: "USER", accountRole: "USER", accessMode: "USER" };
    req.tenant = { id: "tenant-1", name: "Owner workspace", status: "ACTIVE", kind: "CUSTOMER", role: role as never };
    next();
  });
  app.use(createSalesDepartmentRouter(database));
  app.use(errorHandler);
  return app;
}

describe("AI Sales Department routes", () => {
  const original = {
    enabled: env.SEARCH_ENABLED,
    key: env.TAVILY_API_KEY,
    budget: env.SEARCH_MONTHLY_REQUEST_LIMIT,
    groq: env.GROQ_API_KEY,
    outbound: env.OUTBOUND_EMAIL_ENABLED,
    mode: env.OUTBOUND_DELIVERY_MODE,
  };

  beforeEach(() => {
    env.SEARCH_ENABLED = true;
    env.TAVILY_API_KEY = "configured-test-key";
    env.SEARCH_MONTHLY_REQUEST_LIMIT = 100;
    env.GROQ_API_KEY = "configured-groq-key";
    env.OUTBOUND_EMAIL_ENABLED = true;
    env.OUTBOUND_DELIVERY_MODE = "test";
  });

  afterEach(() => {
    env.SEARCH_ENABLED = original.enabled;
    env.TAVILY_API_KEY = original.key;
    env.SEARCH_MONTHLY_REQUEST_LIMIT = original.budget;
    env.GROQ_API_KEY = original.groq;
    env.OUTBOUND_EMAIL_ENABLED = original.outbound;
    env.OUTBOUND_DELIVERY_MODE = original.mode;
  });

  it("reports observed metrics, workforce state, providers, blockers, and jobs", async () => {
    const { database } = fixture();
    const response = await request(appFor(database)).get("/status?from=2026-07-01T00:00:00.000Z&to=2026-08-02T23:59:59.000Z");

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      workspace: { id: "tenant-1", dataLabel: "REAL" },
      canStart: true,
      metrics: { leadsDiscovered: 2, wonCustomers: 1, revenue: 1200, revenueCurrency: "USD", externalProviderCostsAvailable: false },
      providers: { research: { configured: true }, ai: { configured: true }, email: { enabled: true, mode: "test" } },
    });
    expect(response.body.data.employees).toHaveLength(8);
    expect((await request(appFor(database)).get("/status?from=2026-08-03&to=2026-08-02")).status).toBe(400);
  });

  it("configures, starts, lists, pauses, and emergency-stops bounded work with audits", async () => {
    const { database, methods } = fixture();
    const app = appFor(database);

    const configured = await request(app).put("/config").send(configInput);
    expect(configured.status).toBe(200);
    expect(methods.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SALES_DEPARTMENT_CONFIGURED" }) }));

    const started = await request(app).post("/start").send({ confirm: true });
    expect(started.status).toBe(202);
    expect(started.body.data.jobs).toHaveLength(3);
    expect(methods.automationJob.upsert).toHaveBeenCalledTimes(3);

    const jobs = await request(app).get("/jobs");
    expect(jobs.status).toBe(200);
    expect(jobs.body.data.jobs).toHaveLength(1);

    const paused = await request(app).post("/pause").send({ confirm: true, reason: "Human operator pause" });
    expect(paused.status).toBe(200);
    expect(paused.body.data.jobsCancelled).toBe(2);

    const stopped = await request(app).post("/emergency-stop").send({ confirm: "EMERGENCY STOP", reason: "Human detected a serious compliance risk." });
    expect(stopped.status).toBe(200);
    expect(stopped.body.data).toMatchObject({ jobsCancelled: 2, messagesCancelled: 2 });
  });

  it("fails closed on missing setup, autonomous sender verification, and unauthorized management", async () => {
    const missing = fixture(false);
    const blocked = await request(appFor(missing.database)).post("/start").send({ confirm: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("COMPANY_PROFILE_REQUIRED");

    const autonomous = fixture();
    autonomous.methods.salesDepartmentConfig.upsert.mockResolvedValue({ ...config, mode: "AUTONOMOUS", senderVerified: false } as never);
    const senderBlocked = await request(appFor(autonomous.database)).post("/start").send({ confirm: true });
    expect(senderBlocked.status).toBe(409);
    expect(senderBlocked.body.error.code).toBe("SENDER_VERIFICATION_REQUIRED");

    expect((await request(appFor(fixture().database, "VIEWER")).put("/config").send(configInput)).status).toBe(403);
  });
});
