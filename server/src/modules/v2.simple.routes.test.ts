import express, { type Router } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../lib/prisma.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createAdminRouter } from "./admin/admin.routes.js";
import { createCommandRouter } from "./command/command.routes.js";
import { createCrmRouter } from "./crm/crm.routes.js";
import { createIcpRouter } from "./icp/icp.routes.js";
import { createOperationsRouter } from "./operations/operations.routes.js";

function appFor(router: Router, masterAdmin = false) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.id = "request-1";
    req.user = masterAdmin
      ? { id: "user-1", email: "master@example.com", role: "MASTER_ADMIN", accountRole: "MASTER_ADMIN", accessMode: "MASTER_ADMIN" }
      : { id: "user-1", email: "user@example.com", role: "USER" };
    req.tenant = { id: "tenant-1", name: "Test workspace", status: "ACTIVE", kind: masterAdmin ? "INTERNAL" : "CUSTOMER", role: "TENANT_ADMIN" };
    next();
  });
  app.use(router);
  app.use(errorHandler);
  return app;
}

function databaseFixture() {
  const now = new Date();
  const database = {
    user: { count: vi.fn().mockResolvedValue(10) },
    companyProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    salesGoal: {
      findMany: vi.fn().mockResolvedValue([{ id: "goal-1" }]),
      create: vi.fn(async ({ data }) => ({ id: "goal-1", status: "DRAFT", createdAt: now, ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: "goal-1", userId: "user-1" }),
      update: vi.fn().mockResolvedValue({ id: "goal-1", status: "CONFIRMED" }),
    },
    idealCustomerProfile: {
      findMany: vi.fn().mockResolvedValue([{ id: "icp-1" }]),
      create: vi.fn(async ({ data }) => ({ id: "icp-1", ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: "icp-1", name: "Logistics" }),
    },
    campaign: {
      findMany: vi.fn().mockResolvedValue([{ id: "campaign-1", name: "Campaign", status: "DRAFT", updatedAt: now }]),
      count: vi.fn().mockResolvedValue(2),
      groupBy: vi.fn().mockResolvedValue([{ status: "DRAFT", _count: { _all: 1 } }]),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([{ id: "task-1", userId: "user-1", type: "HUMAN_RESPONSE_REQUIRED", status: "OPEN", title: "Human response required.", createdAt: now }]),
      findFirst: vi.fn().mockResolvedValue({ id: "task-1" }),
      update: vi.fn().mockResolvedValue({ id: "task-1", status: "COMPLETED" }),
      count: vi.fn().mockResolvedValue(1),
    },
    researchJob: { findMany: vi.fn().mockResolvedValue([{ id: "job-1" }]), count: vi.fn().mockResolvedValue(4) },
    aiRequest: { count: vi.fn().mockResolvedValue(7) },
    searchUsage: { aggregate: vi.fn().mockResolvedValue({ _sum: { count: 6 } }) },
    reply: {
      findMany: vi.fn().mockResolvedValue([{ id: "reply-1", requiresHuman: true }]),
      count: vi.fn().mockResolvedValue(2),
    },
    lead: { count: vi.fn().mockResolvedValue(3), findFirst: vi.fn().mockResolvedValue({ id: "lead-1" }) },
    campaignRecipient: { count: vi.fn().mockResolvedValue(5) },
    campaignMessage: {
      groupBy: vi.fn().mockResolvedValue([{ status: "SENT", _count: { _all: 4 } }, { status: "DELIVERED", _count: { _all: 1 } }]),
      count: vi.fn().mockResolvedValue(8),
    },
    optOut: { count: vi.fn().mockResolvedValue(1) },
    refreshSession: { findMany: vi.fn().mockResolvedValue([{ userId: "user-1" }]) },
    $queryRaw: vi.fn().mockResolvedValue([{ count: 1 }]),
    auditLog: {
      findMany: vi.fn().mockResolvedValue([{ id: "audit-1", action: "TEST" }]),
      create: vi.fn().mockResolvedValue({ id: "audit-2" }),
    },
    company: {
      findMany: vi.fn().mockResolvedValue([{ id: "company-1", name: "Example", domain: "example.com", createdAt: now }]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ id: "company-1" }),
      create: vi.fn(async ({ data }) => ({ id: "company-1", createdAt: now, ...data })),
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([{ id: "contact-1", name: "Alex", publicEmail: "alex@example.com", createdAt: now }]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ id: "contact-1" }),
      create: vi.fn(async ({ data }) => ({ id: "contact-1", createdAt: now, ...data })),
    },
    deal: {
      findMany: vi.fn().mockResolvedValue([{ id: "deal-1", name: "Deal", value: { toString: () => "100" }, createdAt: now }]),
      findFirst: vi.fn().mockResolvedValue({ id: "deal-1" }),
      create: vi.fn(async ({ data }) => ({ id: "deal-1", ...data, value: { toString: () => String(data.value) } })),
    },
    crmActivity: {
      findMany: vi.fn().mockResolvedValue([{ id: "activity-1", occurredAt: now }]),
      create: vi.fn(async ({ data }) => ({ id: "activity-1", ...data })),
    },
    note: { create: vi.fn(async ({ data }) => ({ id: "note-1", ...data })) },
  };
  return database as unknown as DatabaseClient;
}

describe("V2 command, ICP, operations, and admin routes", () => {
  let database: DatabaseClient;
  beforeEach(() => { database = databaseFixture(); });

  it("creates and confirms a plan without starting external actions", async () => {
    const app = appFor(createCommandRouter(database));
    expect((await request(app).get("/goals")).status).toBe(200);
    const created = await request(app).post("/goals").send({ goal: "Sell to logistics companies", dailySendingLimit: 20 });
    expect(created.status).toBe(201);
    expect(created.body.data.goal.plan.requiredApprovals).toContain("Paid search");
    expect(created.body.data.goal.plan.targetMarket.industry).toBe("Requires confirmation");
    expect((await request(app).post("/goals/goal-1/confirm").send({ confirmed: true })).status).toBe(200);
    expect((await request(app).get("/overview")).body.data).toMatchObject({ pendingApprovals: 2, humanResponsesNeeded: 1 });
  });

  it("returns 404 when confirming another user's or missing goal", async () => {
    vi.mocked(database.salesGoal.findFirst).mockResolvedValueOnce(null);
    const response = await request(appFor(createCommandRouter(database))).post("/goals/missing/confirm").send({ confirmed: true });
    expect(response.status).toBe(404);
  });

  it("creates, reads, lists, and scores ICPs", async () => {
    const app = appFor(createIcpRouter(database));
    expect((await request(app).get("/")).status).toBe(200);
    const created = await request(app).post("/").send({ name: "India logistics", productService: "Sales platform", targetIndustry: "Logistics", geography: "India", painPoints: [], exclusions: [], campaignGoal: "Find fit" });
    expect(created.status).toBe(201);
    expect(created.body.data.profile.summary).toMatch(/possible-fit/i);
    expect((await request(app).get("/icp-1")).status).toBe(200);
    const scored = await request(app).post("/score").send({ industryFit: 1, locationFit: 1, companySizeFit: 1, evidenceQuality: 1, websiteAvailable: true, publicContactAvailable: false, productRelevance: 1, dataFreshness: 1, confidence: 1, riskFlags: [] });
    expect(scored.body.data.score).toBe(90);
  });

  it("handles owned tasks, replies, and observed-only analytics", async () => {
    const app = appFor(createOperationsRouter(database));
    expect((await request(app).get("/tasks?status=OPEN")).body.data.tasks).toHaveLength(1);
    expect((await request(app).put("/tasks/task-1").send({ status: "COMPLETED" })).body.data.task.status).toBe("COMPLETED");
    expect((await request(app).get("/inbox?requiresHuman=true")).body.data.replies).toHaveLength(1);
    const analytics = await request(app).get("/analytics");
    expect(analytics.body.data).toMatchObject({ emailsSent: 5, replied: 2, positiveResponseRate: null });
    expect(analytics.body.data.unavailableMetrics).toHaveLength(3);
  });

  it("returns sanitized admin aggregates and writes an audit event", async () => {
    const response = await request(appFor(createAdminRouter(database), true)).get("/overview");
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ users: 10, activeUsers: 1, aiRequests: 7, abuseFlags: 1 });
    expect(response.body.data.providerHealth.ai).not.toHaveProperty("apiKey");
    expect(database.auditLog.create).toHaveBeenCalled();
  });
});

describe("V2 CRM routes", () => {
  let database: DatabaseClient;
  beforeEach(() => { database = databaseFixture(); });

  it("lists searchable CRM resources and serializes deal values", async () => {
    const app = appFor(createCrmRouter(database));
    for (const path of ["/companies?search=ex&sort=name", "/contacts?search=alex&sort=oldest", "/deals?search=deal", "/activities?search=call"]) {
      expect((await request(app).get(path)).status).toBe(200);
    }
    expect((await request(app).get("/deals")).body.data.deals[0].value).toBe("100");
  });

  it("creates user-provided companies and detects domain duplicates", async () => {
    const app = appFor(createCrmRouter(database));
    const created = await request(app).post("/companies").send({ name: "Example", website: "https://www.example.com", industry: "Logistics" });
    expect(created.status).toBe(201);
    expect(created.body.data.company.riskFlags).toEqual(["USER_PROVIDED_REQUIRES_CONFIRMATION"]);
    vi.mocked(database.company.findUnique).mockResolvedValueOnce({ id: "duplicate" } as never);
    expect((await request(app).post("/companies").send({ name: "Duplicate", website: "https://example.com" })).status).toBe(409);
  });

  it("requires a public source for professional contact data and deduplicates email", async () => {
    const app = appFor(createCrmRouter(database));
    expect((await request(app).post("/contacts").send({ name: "Alex", publicEmail: "alex@example.com" })).status).toBe(400);
    const created = await request(app).post("/contacts").send({ name: "Alex", companyId: "company-1", publicEmail: "alex@example.com", publicSourceUrl: "https://example.com/team", verificationStatus: "PARTIALLY_VERIFIED" });
    expect(created.status).toBe(201);
    vi.mocked(database.contact.findUnique).mockResolvedValueOnce({ id: "duplicate" } as never);
    expect((await request(app).post("/contacts").send({ name: "Alex", publicEmail: "alex@example.com", publicSourceUrl: "https://example.com/team" })).status).toBe(409);
  });

  it("creates related deals, activities, and notes only after ownership checks", async () => {
    const app = appFor(createCrmRouter(database));
    expect((await request(app).post("/deals").send({ companyId: "company-1", name: "Deal", stage: "QUALIFYING", value: 100, currency: "USD" })).status).toBe(201);
    expect((await request(app).post("/activities").send({ contactId: "contact-1", type: "CALL", summary: "User recorded call" })).status).toBe(201);
    expect((await request(app).post("/notes").send({ leadId: "lead-1", body: "User note" })).status).toBe(201);
    vi.mocked(database.company.findFirst).mockResolvedValueOnce(null);
    expect((await request(app).post("/deals").send({ companyId: "other-company", name: "Deal", stage: "QUALIFYING", value: 1 })).status).toBe(404);
  });

  it("validates imports without writing and reports existing domains and emails", async () => {
    const app = appFor(createCrmRouter(database));
    const response = await request(app).post("/import/validate").send({ companies: [{ name: "Example", website: "https://example.com" }], contacts: [{ name: "Alex", publicEmail: "alex@example.com", publicSourceUrl: "https://example.com/team" }] });
    expect(response.body.data).toMatchObject({ valid: false, writesPerformed: false, duplicateDomains: ["example.com"], duplicateEmails: ["alex@example.com"] });
    expect(database.company.create).not.toHaveBeenCalled();
  });
});
