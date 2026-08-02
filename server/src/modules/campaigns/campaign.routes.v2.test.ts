import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import type { EmailService } from "../../lib/email.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { errorHandler } from "../../middleware/error-handler.js";

vi.mock("../ai/ai.service.js", () => ({
  askGroq: vi.fn().mockResolvedValue(JSON.stringify({
    subject: "A careful sales research approach",
    greeting: "Hello Alex,",
    body: "AI Sales Platform supports evidence-backed prospect research for Example Logistics.",
    cta: "Would you be open to reviewing whether it fits your process?",
    closing: "Best regards,",
  })),
}));

import { createCampaignRouter } from "./campaign.routes.js";

function appFor(database: DatabaseClient, redis: RedisClient | null, emailService: EmailService) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.id = "request-1";
    req.user = { id: "user-1", email: "user@example.com", role: "USER" };
    req.tenant = { id: "tenant-1", name: "Test workspace", status: "ACTIVE", kind: "CUSTOMER", role: "TENANT_ADMIN" };
    next();
  });
  app.use(createCampaignRouter(database, redis, emailService));
  app.use(errorHandler);
  return app;
}

const now = new Date("2026-07-26T12:00:00.000Z");
const baseCampaign = {
  id: "campaign-1",
  tenantId: "tenant-1",
  userId: "user-1",
  idealCustomerProfileId: null,
  name: "Grounded campaign",
  salesGoal: "Introduce the platform",
  productService: "AI Sales Platform",
  valueProposition: "Evidence-backed prospect research",
  audienceFilters: {},
  senderIdentity: { displayName: "Sam", email: "sam@example.com" },
  emailTemplate: { tone: "Friendly" },
  sequenceConfig: { followUps: [] },
  schedule: { timezone: "UTC", weekdays: [1, 2, 3, 4, 5], windowStart: "09:00", windowEnd: "17:00" },
  dailySendingLimit: 25,
  status: "DRAFT",
  contentVersion: 1,
  approvedVersion: null,
  pausedAt: null,
  launchedAt: null,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};
const baseMessage = {
  id: "message-1",
  tenantId: "tenant-1",
  userId: "user-1",
  campaignId: "campaign-1",
  recipientId: "recipient-1",
  kind: "INITIAL",
  sequenceStep: 0,
  subject: "Subject",
  greeting: "Hello Alex,",
  body: "Grounded body",
  cta: "Would a review be useful?",
  closing: "Best regards,",
  signature: "Sam",
  factsUsed: {},
  evidenceIds: ["ev-1"],
  promptVersion: "v2-grounded-email-1",
  contentVersion: 1,
  status: "DRAFT",
  scheduledAt: now,
  queuedAt: null,
  sentAt: null,
  providerMessageId: null,
  idempotencyKey: "key-1",
  failureReason: null,
  attemptCount: 0,
  maxAttempts: 3,
  lastAttemptAt: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

function fixture() {
  const methods = {
    campaign: {
      findMany: vi.fn().mockResolvedValue([baseCampaign]),
      create: vi.fn(async ({ data }) => ({ ...baseCampaign, ...data })),
      findFirst: vi.fn().mockResolvedValue(baseCampaign),
      update: vi.fn(async ({ data }) => ({ ...baseCampaign, ...data })),
    },
    idealCustomerProfile: { findFirst: vi.fn().mockResolvedValue({ id: "icp-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    campaignMessage: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ ...baseMessage, campaign: baseCampaign }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }) => ({ id: "message-created", ...data })),
      update: vi.fn(async ({ data }) => ({ ...baseMessage, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    campaignRecipient: {
      findFirst: vi.fn().mockResolvedValue({ id: "recipient-1", tenantId: "tenant-1", campaignId: "campaign-1" }),
      findMany: vi.fn().mockResolvedValue([{ id: "recipient-1" }]),
      upsert: vi.fn().mockResolvedValue({ id: "recipient-1" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    campaignApproval: { create: vi.fn().mockResolvedValue({ id: "approval-1", contentVersion: 1 }) },
    lead: {
      findMany: vi.fn().mockResolvedValue([{ id: "lead-1", companyRecordId: "company-1", contactRecordId: null, email: "alex@example.com" }]),
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([{ id: "contact-1", companyId: "company-1", publicEmail: "alex@example.com", name: "Alex", verificationStatus: "PARTIALLY_VERIFIED" }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    company: {},
    companyProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    userSettings: { findUnique: vi.fn().mockResolvedValue({ aiProvider: "GROQ", signature: "Sam", unsubscribeFooter: "Reply unsubscribe to opt out.", campaignDailyLimit: 25 }) },
    optOut: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "optout-1" }),
    },
    reply: { create: vi.fn().mockResolvedValue({ id: "reply-1", requiresHuman: true }) },
    task: { create: vi.fn().mockResolvedValue({ id: "task-1" }) },
  };
  const database = {
    ...methods,
    $transaction: vi.fn(async (operation) => typeof operation === "function" ? operation(methods) : Promise.all(operation)),
  } as unknown as DatabaseClient;
  const redis = { sendCommand: vi.fn().mockResolvedValue(1) } as unknown as RedisClient;
  const emailService = { sendCampaign: vi.fn().mockResolvedValue(undefined) } as unknown as EmailService;
  return { database, methods, redis, emailService };
}

const createPayload = {
  name: "Grounded campaign",
  salesGoal: "Introduce the platform",
  productService: "AI Sales Platform",
  valueProposition: "Evidence-backed prospect research",
  audienceFilters: {},
  senderIdentity: { displayName: "Sam", email: "sam@example.com" },
  tone: "Friendly",
  sequenceConfig: { followUps: [] },
  schedule: { timezone: "UTC", weekdays: [1, 2, 3, 4, 5], windowStart: "09:00", windowEnd: "17:00" },
  dailySendingLimit: 25,
};

describe("campaign routes", () => {
  const originalOutbound = env.OUTBOUND_EMAIL_ENABLED;
  beforeEach(() => { env.OUTBOUND_EMAIL_ENABLED = false; });
  afterEach(() => { env.OUTBOUND_EMAIL_ENABLED = originalOutbound; });

  it("lists, creates, reads, and updates owned campaigns while invalidating approval", async () => {
    const { database, methods, redis, emailService } = fixture();
    const app = appFor(database, redis, emailService);
    expect((await request(app).get("/")).body.data.campaigns).toHaveLength(1);
    expect((await request(app).post("/").send({ ...createPayload, idealCustomerProfileId: "icp-1" })).status).toBe(201);
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, recipients: [], messages: [], approvals: [] } as never);
    expect((await request(app).get("/campaign-1")).status).toBe(200);
    expect((await request(app).put("/campaign-1").send({ name: "Updated", dailySendingLimit: 1000 })).body.data.approvalInvalidated).toBe(true);
    expect(methods.campaignMessage.updateMany).toHaveBeenCalled();
  });

  it("rejects missing campaigns and unowned recipients", async () => {
    const { database, methods, redis, emailService } = fixture();
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce(null);
    expect((await request(appFor(database, redis, emailService)).get("/missing")).status).toBe(404);
    const app = appFor(database, redis, emailService);
    vi.mocked(methods.lead.findMany).mockResolvedValueOnce([]);
    expect((await request(app).post("/campaign-1/recipients").send({ leadIds: ["other-lead"], contactIds: [] })).status).toBe(422);
  });

  it("adds owned leads and verified contacts and requires re-approval", async () => {
    const { database, methods, redis, emailService } = fixture();
    const response = await request(appFor(database, redis, emailService)).post("/campaign-1/recipients").send({ leadIds: ["lead-1"], contactIds: ["contact-1"] });
    expect(response.body.data).toEqual({ added: 2, approvalInvalidated: true });
    expect(methods.campaignRecipient.upsert).toHaveBeenCalledTimes(2);
  });

  it("generates only evidence-grounded drafts after explicit confirmation", async () => {
    const { database, methods, redis, emailService } = fixture();
    const research = {
      companyName: "Example Logistics",
      industry: "Logistics",
      evidence: [
        { id: "ev-1", field: "companyName", value: "Example Logistics", verificationStatus: "VERIFIED" },
        { id: "ev-2", field: "industry", value: "Logistics", verificationStatus: "PARTIALLY_VERIFIED" },
      ],
    };
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({
      ...baseCampaign,
      recipients: [{ id: "recipient-1", company: { ...baseCampaign, name: "Example Logistics", researchResults: [research] }, contact: { name: "Alex", verificationStatus: "PARTIALLY_VERIFIED", company: null }, lead: null }],
    } as never);
    const response = await request(appFor(database, redis, emailService)).post("/campaign-1/drafts").send({ confirm: true });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ created: 1, status: "READY_FOR_REVIEW" });
    expect(methods.campaignMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ evidenceIds: ["ev-1", "ev-2"], promptVersion: "v3-company-knowledge-grounded-email-1" }) }));
  });

  it("skips drafting without evidence and refuses non-Groq generation", async () => {
    const { database, methods, redis, emailService } = fixture();
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, recipients: [{ id: "recipient-1", company: null, contact: null, lead: null }] } as never);
    const skipped = await request(appFor(database, redis, emailService)).post("/campaign-1/drafts").send({ confirm: true });
    expect(skipped.body.data.skipped[0].reason).toBe("VERIFIED_EVIDENCE_REQUIRED");
    vi.mocked(methods.userSettings.findUnique).mockResolvedValueOnce({ aiProvider: "MOCK" } as never);
    expect((await request(appFor(database, redis, emailService)).post("/campaign-1/drafts").send({ confirm: true })).status).toBe(503);
  });

  it("manual edits invalidate approval and sent messages remain immutable", async () => {
    const { database, methods, redis, emailService } = fixture();
    const app = appFor(database, redis, emailService);
    const response = await request(app).put("/messages/message-1").send({ subject: "Edited", greeting: "Hello", body: "Grounded body", cta: "Open to a review?", closing: "Regards" });
    expect(response.body.data).toMatchObject({ contentVersion: 2, approvalInvalidated: true });
    expect((await request(app).put("/messages/message-1").send({ subject: "Edited\r\nBcc: attacker@example.test", greeting: "Hello", body: "Body", cta: "Reply", closing: "Regards" })).status).toBe(400);
    vi.mocked(methods.campaignMessage.findFirst).mockResolvedValueOnce({ ...baseMessage, status: "SENT", campaign: baseCampaign } as never);
    expect((await request(app).put("/messages/message-1").send({ subject: "Edited", greeting: "Hello", body: "Body", cta: "Reply", closing: "Regards" })).status).toBe(409);
  });

  it("creates an immutable approval and queues only unsuppressed recipients", async () => {
    const { database, methods, redis, emailService } = fixture();
    const app = appFor(database, redis, emailService);
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, recipients: [{ id: "recipient-1" }], messages: [baseMessage] } as never);
    expect((await request(app).post("/campaign-1/approve").send({ approved: true, approvalType: "INITIAL_ONLY" })).status).toBe(201);
    expect(methods.campaignApproval.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recipientCount: 1, messageSnapshot: expect.any(Array) }) }));
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, status: "APPROVED", approvedVersion: 1, recipients: [{ id: "recipient-1", contact: { publicEmail: "alex@example.com" }, lead: null, repliedAt: null, optedOutAt: null }], messages: [{ ...baseMessage, status: "APPROVED" }], approvals: [{ contentVersion: 1 }] } as never);
    expect((await request(app).post("/campaign-1/queue").send({ confirm: true })).body.data.queued).toBe(1);
  });

  it("requires a current immutable approval before queue or send", async () => {
    const { database, methods, redis, emailService } = fixture();
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, status: "APPROVED", approvedVersion: 1, recipients: [], messages: [], approvals: [] } as never);
    expect((await request(appFor(database, redis, emailService)).post("/campaign-1/queue").send({ confirm: true })).status).toBe(409);
    env.OUTBOUND_EMAIL_ENABLED = true;
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, status: "SCHEDULED", approvedVersion: 1, approvals: [] } as never);
    expect((await request(appFor(database, redis, emailService)).post("/campaign-1/send-approved").send({ confirm: true })).status).toBe(409);
  });

  it("pauses, resumes, and permanently stops pending campaign work", async () => {
    const { database, methods, redis, emailService } = fixture();
    const app = appFor(database, redis, emailService);
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, status: "RUNNING", approvals: [{ contentVersion: 1 }] } as never);
    expect((await request(app).post("/campaign-1/pause").send({ confirm: true })).status).toBe(200);
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, status: "PAUSED", approvedVersion: 1, approvals: [{ contentVersion: 1 }] } as never);
    vi.mocked(methods.campaignMessage.count).mockResolvedValueOnce(1);
    expect((await request(app).post("/campaign-1/resume").send({ confirm: true })).status).toBe(200);
    vi.mocked(methods.campaign.findFirst).mockResolvedValueOnce({ ...baseCampaign, status: "DRAFT" } as never);
    expect((await request(app).post("/campaign-1/stop").send({ confirm: true })).body.data.pendingMessagesCancelled).toBe(true);
  });

  it("sends one bounded approved batch and records provider failures safely", async () => {
    const { database, methods, redis, emailService } = fixture();
    env.OUTBOUND_EMAIL_ENABLED = true;
    vi.mocked(methods.campaign.findFirst).mockResolvedValue({ ...baseCampaign, status: "SCHEDULED", approvedVersion: 1, approvals: [{ contentVersion: 1 }] } as never);
    vi.mocked(methods.campaignMessage.count).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    vi.mocked(methods.campaignMessage.findMany).mockResolvedValueOnce([{ ...baseMessage, status: "QUEUED", recipient: { id: "recipient-1", status: "QUEUED", repliedAt: null, optedOutAt: null, stopReason: null, contact: { publicEmail: "alex@example.com" }, lead: { email: null, confidence: 0.9 } } }] as never);
    const response = await request(appFor(database, redis, emailService)).post("/campaign-1/send-approved").send({ confirm: true });
    expect(response.body.data.sent).toBe(1);
    expect(emailService.sendCampaign).toHaveBeenCalledTimes(1);

    vi.mocked(methods.campaignMessage.count).mockReset().mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    vi.mocked(methods.campaignMessage.findMany).mockResolvedValueOnce([{ ...baseMessage, status: "QUEUED", recipient: { id: "recipient-1", status: "QUEUED", repliedAt: null, optedOutAt: null, stopReason: null, contact: { publicEmail: "alex@example.com" }, lead: { email: null, confidence: 0.9 } } }] as never);
    vi.mocked(emailService.sendCampaign!).mockRejectedValueOnce(new Error("provider secret"));
    const failed = await request(appFor(database, redis, emailService)).post("/campaign-1/send-approved").send({ confirm: true });
    expect(failed.body.data.failed).toBe(1);
    expect(methods.campaignMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureReason: "EMAIL_PROVIDER_UNAVAILABLE" }) }));
  });

  it("stops future messages on reply and opt-out and creates a human task", async () => {
    const { database, methods, redis, emailService } = fixture();
    const app = appFor(database, redis, emailService);
    const reply = await request(app).post("/recipients/recipient-1/replies").send({ providerReplyId: "reply-provider-1", contentPreview: "Interested", classification: "INTERESTED" });
    expect(reply.body.data.automationStopped).toBe(true);
    expect(methods.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "Human response required." }) }));
    const optOut = await request(app).post("/opt-outs").send({ email: "alex@example.com", source: "RECIPIENT", reason: "Requested" });
    expect(optOut.body.data.stoppedRecipients).toBe(1);
    expect(methods.optOut.upsert).toHaveBeenCalled();
  });
});
