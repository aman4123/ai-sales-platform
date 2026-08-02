import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../lib/prisma.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createAdminRouter } from "./admin.routes.js";

function appFor(accessMode: "TESTER" | "MASTER_ADMIN") {
  const transaction = {
    company: { upsert: vi.fn().mockResolvedValue({ id: "company-1", name: "Northstar Logistics (Demo)", industry: "Logistics" }) },
    contact: { upsert: vi.fn().mockResolvedValue({ id: "contact-1", name: "Jordan Lee (Demo)", publicEmail: "jordan@northstar.demo.invalid" }) },
    lead: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "lead-1" }) },
    deal: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "deal-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const database = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
  } as unknown as DatabaseClient;
  const app = express();
  app.use(express.json());
  app.use((incoming, _response, next) => {
    incoming.id = "request-1";
    incoming.user = {
      id: "master-1",
      email: "master@example.com",
      role: accessMode === "TESTER" ? "ADMIN" : "SUPER_ADMIN",
      accountRole: "SUPER_ADMIN",
      accessMode,
      sessionId: "session-1",
    };
    incoming.tenant = {
      id: "test-tenant-1",
      name: "Internal Tester Workspace",
      status: "ACTIVE",
      kind: "TEST",
      role: "TENANT_ADMIN",
    };
    next();
  });
  app.use(createAdminRouter(database));
  app.use(errorHandler);
  return { app, transaction };
}

describe("Tester Mode demo workspace", () => {
  it("creates clearly labeled data only for the Master Admin owner", async () => {
    const { app, transaction } = appFor("TESTER");
    const response = await request(app).post("/demo-data");
    expect(response.status).toBe(201);
    expect(response.body.data.isolatedToUserId).toBe("master-1");
    expect(transaction.company.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_domain: { tenantId: "test-tenant-1", domain: "northstar-logistics.demo.invalid" } },
    }));
    expect(transaction.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "test-tenant-1", userId: "master-1", riskFlags: ["TEST_DATA", "NOT_VERIFIED"] }),
    });
  });

  it("rejects demo-data creation outside Tester Mode", async () => {
    const { app } = appFor("MASTER_ADMIN");
    expect((await request(app).post("/demo-data")).status).toBe(403);
  });
});

function ownerControlFixture() {
  const now = new Date("2026-08-02T12:00:00.000Z");
  const plan = {
    id: "plan-1", code: "FREE_TRIAL", name: "Free Trial", status: "ACTIVE",
    description: "Bounded trial", monthlyPriceMinor: 0, currency: "USD",
    userLimit: 1, leadLimit: 100, campaignLimit: 3, aiMonthlyRequestLimit: 10,
    researchMonthlyLimit: 5, storageLimitMb: 100, features: {}, createdAt: now,
    updatedAt: now, archivedAt: null,
  };
  const target = {
    id: "user-2", name: "Customer", email: "customer@example.test", role: "USER",
    status: "ACTIVE", emailVerifiedAt: now, deletedAt: null,
    tenantMemberships: [{ id: "membership-2", tenantId: "tenant-2", role: "TENANT_ADMIN" }],
  };
  const tenant = {
    id: "tenant-2", name: "Customer workspace", slug: "customer-workspace", status: "ACTIVE",
    kind: "CUSTOMER", ownerUserId: target.id, createdAt: now, updatedAt: now, archivedAt: null,
  };
  const failedJob = {
    id: "job-failed", tenantId: tenant.id, ownerUserId: target.id, category: "LEAD_DISCOVERY",
    status: "FAILED", attemptCount: 3, maxAttempts: 3, timeoutMs: 30_000, scheduledAt: now,
    nextAttemptAt: null, startedAt: now, completedAt: now, cancelRequestedAt: null,
    cancelledAt: null, errorCode: "PROVIDER_FAILED", errorMessage: "Safe failure", resultSummary: null, createdAt: now,
  };
  const pendingJob = { ...failedJob, id: "job-pending", status: "PENDING", attemptCount: 0 };
  const support = {
    id: "support-1", actorUserId: "master-1", targetUserId: target.id, tenantId: tenant.id,
    accessLevel: "READ_ONLY", reason: "Investigate a customer-reported issue.", startedAt: now,
    expiresAt: new Date(now.getTime() + 900_000), endedAt: null,
  };
  const methods = {
    user: {
      findMany: vi.fn().mockResolvedValue([target]),
      findUnique: vi.fn().mockResolvedValue(target),
      findFirst: vi.fn().mockResolvedValue(target),
      update: vi.fn().mockResolvedValue(target),
      count: vi.fn().mockResolvedValue(2),
    },
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: "membership-2", tenantId: tenant.id, userId: target.id }),
      update: vi.fn().mockResolvedValue({}),
    },
    refreshSession: {
      findMany: vi.fn().mockResolvedValue([{ id: "session-2", tenantId: tenant.id, accessMode: "USER", userAgent: "Browser", ipAddress: "127.0.0.1", expiresAt: new Date(now.getTime() + 60_000), revokedAt: null, createdAt: now }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    accountToken: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "token-1" }),
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue([{ ...tenant, subscription: { plan }, aiBudget: { mode: "LIMITED" }, companyProfile: null, _count: { memberships: 1, dailyBriefs: 0 } }]),
      findUnique: vi.fn().mockResolvedValue(tenant),
      findFirst: vi.fn().mockResolvedValue({ ...tenant, subscription: { plan }, _count: { memberships: 0 } }),
      create: vi.fn().mockResolvedValue({ ...tenant, id: "tenant-created", subscription: { plan }, aiBudget: { mode: "LIMITED" } }),
      update: vi.fn(async ({ data }) => ({ ...tenant, ...data })),
      count: vi.fn().mockResolvedValue(2),
      groupBy: vi.fn().mockResolvedValue([{ status: "ACTIVE", _count: { _all: 2 } }]),
    },
    plan: {
      findUnique: vi.fn().mockResolvedValue(plan),
      findMany: vi.fn().mockResolvedValue([{ ...plan, _count: { subscriptions: 1 } }]),
      create: vi.fn(async ({ data }) => ({ ...plan, id: "plan-created", ...data })),
      update: vi.fn(async ({ data }) => ({ ...plan, ...data })),
    },
    subscription: {
      upsert: vi.fn().mockResolvedValue({ id: "subscription-1", tenantId: tenant.id, status: "TRIAL", plan }),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([{ status: "TRIAL", _count: { _all: 1 } }]),
    },
    aiBudget: {
      upsert: vi.fn().mockResolvedValue({ id: "budget-1", tenantId: tenant.id, mode: "LIMITED", monthlyRequestLimit: 10 }),
      groupBy: vi.fn().mockResolvedValue([{ mode: "LIMITED", _count: { _all: 1 } }]),
    },
    automationJob: {
      findMany: vi.fn().mockResolvedValue([failedJob]),
      findUnique: vi.fn().mockResolvedValueOnce(failedJob).mockResolvedValueOnce(pendingJob),
      update: vi.fn(async ({ data }) => ({ ...failedJob, ...data })),
      groupBy: vi.fn().mockResolvedValue([{ status: "COMPLETED", _count: { _all: 2 } }]),
    },
    featureFlag: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ id: "flag-1", ...data })),
      update: vi.fn().mockResolvedValue({}),
    },
    supportSession: {
      findMany: vi.fn().mockResolvedValue([support]),
      create: vi.fn().mockResolvedValue(support),
      update: vi.fn(async ({ data }) => ({ ...support, ...data })),
    },
    salesDepartmentConfig: { groupBy: vi.fn().mockResolvedValue([{ status: "RUNNING", _count: { _all: 1 } }]) },
    aiRequest: { count: vi.fn().mockResolvedValue(4) },
    searchUsage: { aggregate: vi.fn().mockResolvedValue({ _sum: { count: 3 } }) },
    campaignMessage: { count: vi.fn().mockResolvedValue(2) },
    researchJob: { count: vi.fn().mockResolvedValue(1) },
    optOut: { count: vi.fn().mockResolvedValue(0) },
    campaign: { groupBy: vi.fn().mockResolvedValue([{ status: "DRAFT", _count: { _all: 1 } }]) },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([{ id: "audit-1", action: "TEST", resourceType: "Tenant", createdAt: now }]),
      create: vi.fn().mockResolvedValue({ id: "audit-created" }),
    },
  };
  const database = {
    ...methods,
    $queryRaw: vi.fn().mockResolvedValue([{ count: 1 }]),
    $transaction: vi.fn(async (operation) => Array.isArray(operation) ? Promise.all(operation) : operation(methods)),
  } as unknown as DatabaseClient;
  const redis = { sendCommand: vi.fn().mockResolvedValue("PONG") };
  const app = express();
  app.use(express.json());
  app.use((incoming, _response, next) => {
    incoming.id = "request-1";
    incoming.user = { id: "master-1", email: "master@example.test", role: "MASTER_ADMIN", accountRole: "MASTER_ADMIN", accessMode: "MASTER_ADMIN", sessionId: "session-1" };
    incoming.tenant = { id: "tenant-master", name: "Internal Company Workspace", status: "ACTIVE", kind: "INTERNAL", role: "TENANT_ADMIN" };
    next();
  });
  app.use(createAdminRouter(database, undefined, redis as never));
  app.use(errorHandler);
  return { app, methods, plan, tenant, target };
}

describe("Master Admin owner control center", () => {
  it("operates users, tenants, plans, budgets, jobs, flags, support, audit, and system health", async () => {
    const { app, plan, tenant, target } = ownerControlFixture();
    const agent = request(app);

    expect((await agent.get("/users?search=customer")).status).toBe(200);
    expect((await agent.patch(`/users/${target.id}`).send({ status: "SUSPENDED", tenantRole: "VIEWER", verified: true })).status).toBe(200);
    expect((await agent.post(`/users/${target.id}/revoke-sessions`).send({ confirm: true, reason: "Security review" })).body.data.revoked).toBe(1);
    const sessions = await agent.get(`/users/${target.id}/sessions`);
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.sessions[0]).toMatchObject({ deviceFingerprint: expect.any(String), networkFingerprint: expect.any(String) });

    expect((await agent.get("/tenants?search=customer")).status).toBe(200);
    expect((await agent.post("/tenants").send({ name: "New Customer", slug: "new-customer", ownerUserId: target.id, planCode: "FREE_TRIAL" })).status).toBe(201);
    expect((await agent.patch(`/tenants/${tenant.id}/status`).send({ status: "SUSPENDED", reason: "Requested operational pause", confirm: true })).status).toBe(200);
    expect((await agent.put(`/tenants/${tenant.id}/ai-budget`).send({ mode: "LIMITED", monthlyRequestLimit: 25, warningThresholdPercent: 80, reason: "Approved bounded allowance", confirm: true })).status).toBe(200);
    expect((await agent.put(`/tenants/${tenant.id}/subscription`).send({ planCode: plan.code, status: "TRIAL", trialEndsAt: "2026-08-16T00:00:00.000Z", reason: "Approved trial assignment", confirm: true })).status).toBe(200);

    expect((await agent.get("/plans")).status).toBe(200);
    const planInput = { code: "TEST_PLAN", name: "Test Plan", description: "Bounded plan", monthlyPriceMinor: 0, currency: "USD", userLimit: 2, leadLimit: 100, campaignLimit: 5, aiMonthlyRequestLimit: 10, researchMonthlyLimit: 5, storageLimitMb: 100, features: { test: true }, reason: "Coverage-controlled plan operation", confirm: true };
    expect((await agent.post("/plans").send(planInput)).status).toBe(201);
    const planUpdate = Object.fromEntries(Object.entries(planInput).filter(([key]) => key !== "code"));
    expect((await agent.put(`/plans/${plan.id}`).send({ ...planUpdate, name: "Updated Plan" })).status).toBe(200);
    expect((await agent.post(`/plans/${plan.id}/archive`).send({ reason: "No active subscriptions remain", confirm: true })).status).toBe(200);

    expect((await agent.get("/jobs?status=FAILED")).status).toBe(200);
    expect((await agent.post("/jobs/job-failed/retry").send({ reason: "Provider recovered", confirm: true })).status).toBe(200);
    expect((await agent.post("/jobs/job-pending/cancel").send({ reason: "Operator cancelled", confirm: true })).status).toBe(200);

    expect((await agent.get("/feature-flags")).status).toBe(200);
    expect((await agent.put("/feature-flags").send({ key: "sales.safe_beta", scope: "TENANT", tenantId: tenant.id, enabled: true, rolloutPercent: 100, reason: "Approved tenant beta", confirm: true })).status).toBe(200);

    expect((await agent.get("/support-sessions")).status).toBe(200);
    const support = await agent.post("/support-sessions").send({ targetUserId: target.id, tenantId: tenant.id, accessLevel: "READ_ONLY", reason: "Investigate a customer-reported issue.", durationMinutes: 15, confirm: true });
    expect(support.status).toBe(201);
    expect((await agent.post("/support-sessions/support-1/end").send({ reason: "Support investigation completed", confirm: true })).status).toBe(200);

    expect((await agent.get("/system")).body.data).toMatchObject({ database: "UP", redis: "UP", webService: "UP" });
    expect((await agent.get("/audit-logs?action=test")).status).toBe(200);
    expect((await agent.get("/overview")).status).toBe(200);
  });

  it("rejects Master-only operations when the secure server-side mode is absent", async () => {
    const { app } = appFor("TESTER");
    expect((await request(app).get("/plans")).status).toBe(403);
  });
});
