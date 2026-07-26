import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createEmailWebhookRouter } from "./email-webhook.routes.js";

function appFor(database: DatabaseClient) {
  const app = express();
  app.use(express.json({
    verify: (incomingRequest, _response, body) => {
      (incomingRequest as express.Request).rawBody = Buffer.from(body);
    },
  }));
  app.use((req, _res, next) => { req.id = "request-1"; next(); });
  app.use(createEmailWebhookRouter(database));
  app.use(errorHandler);
  return app;
}

function fixture() {
  const transaction = {
    deliveryEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    campaignMessage: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    campaignRecipient: { update: vi.fn().mockResolvedValue({}) },
    optOut: { upsert: vi.fn().mockResolvedValue({ id: "optout-1" }) },
    reply: { create: vi.fn().mockResolvedValue({ id: "reply-1" }) },
    task: { create: vi.fn().mockResolvedValue({ id: "task-1" }) },
  };
  const message = {
    id: "message-1",
    userId: "user-1",
    campaignId: "campaign-1",
    recipientId: "recipient-1",
    recipient: {
      contact: { publicEmail: "alex@example.com" },
      lead: null,
    },
  };
  const database = {
    campaignMessage: { findUnique: vi.fn().mockResolvedValue(message) },
    deliveryEvent: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (operation) => operation(transaction)),
  } as unknown as DatabaseClient;
  return { database, transaction };
}

const event = {
  providerEventId: "provider-event-1",
  messageId: "message-1",
  type: "DELIVERED",
  occurredAt: new Date().toISOString(),
};

function postEvent(
  database: DatabaseClient,
  provider: string,
  payload: Record<string, unknown>,
  secret = env.EMAIL_WEBHOOK_SECRET ?? "disabled-webhook-secret",
  timestamp = Math.floor(Date.now() / 1_000).toString(),
) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("hex");
  return request(appFor(database))
    .post(`/${provider}`)
    .set("content-type", "application/json")
    .set("x-webhook-timestamp", timestamp)
    .set("x-webhook-signature", `sha256=${signature}`)
    .send(body);
}

describe("email provider webhook", () => {
  const originalSecret = env.EMAIL_WEBHOOK_SECRET;
  beforeEach(() => { env.EMAIL_WEBHOOK_SECRET = "independent-test-webhook-secret"; });
  afterEach(() => { env.EMAIL_WEBHOOK_SECRET = originalSecret; });

  it("fails closed when disabled or when the signature is invalid", async () => {
    const { database } = fixture();
    env.EMAIL_WEBHOOK_SECRET = undefined;
    expect((await postEvent(database, "resend", event)).status).toBe(503);
    env.EMAIL_WEBHOOK_SECRET = "independent-test-webhook-secret";
    expect((await postEvent(database, "resend", event, "wrong")).status).toBe(401);
  });

  it("accepts unknown messages and duplicate provider events idempotently", async () => {
    const { database } = fixture();
    vi.mocked(database.campaignMessage.findUnique).mockResolvedValueOnce(null);
    const unknown = await postEvent(database, "resend", event);
    expect(unknown.status).toBe(202);
    vi.mocked(database.deliveryEvent.findUnique).mockResolvedValueOnce({ id: "existing" } as never);
    const duplicate = await postEvent(database, "resend", event);
    expect(duplicate.body.data).toMatchObject({ accepted: true, duplicate: true });
  });

  it("rejects stale or future events and treats concurrent unique conflicts as duplicates", async () => {
    const { database } = fixture();
    const stale = await postEvent(database, "resend", { ...event, occurredAt: new Date(Date.now() - 31 * 86_400_000).toISOString() });
    const future = await postEvent(database, "resend", { ...event, occurredAt: new Date(Date.now() + 6 * 60_000).toISOString() });
    expect(stale.status).toBe(400);
    expect(future.status).toBe(400);
    const staleSignature = await postEvent(database, "resend", event, env.EMAIL_WEBHOOK_SECRET!, String(Math.floor(Date.now() / 1_000) - 301));
    const futureSignature = await postEvent(database, "resend", event, env.EMAIL_WEBHOOK_SECRET!, String(Math.floor(Date.now() / 1_000) + 301));
    expect(staleSignature.status).toBe(401);
    expect(futureSignature.status).toBe(401);
    vi.mocked(database.$transaction).mockRejectedValueOnce({ code: "P2002" });
    const concurrent = await postEvent(database, "resend", { ...event, providerEventId: "concurrent-event" });
    expect(concurrent.body.data).toEqual({ accepted: true, duplicate: true });
  });

  it("records delivery state without storing the raw provider payload", async () => {
    const { database, transaction } = fixture();
    const response = await postEvent(database, "resend", event);
    expect(response.status).toBe(202);
    expect(transaction.deliveryEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ providerEventId: "provider-event-1", type: "DELIVERED" }) }));
    expect(transaction.deliveryEvent.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rawPayload: expect.anything() }) }));
    expect(transaction.campaignMessage.update).toHaveBeenCalled();
  });

  it.each(["BOUNCED", "COMPLAINT", "UNSUBSCRIBED", "REPLIED"])("stops follow-ups for %s", async (type) => {
    const { database, transaction } = fixture();
    const response = await postEvent(database, "postmark", { ...event, providerEventId: `event-${type}`, type });
    expect(response.status).toBe(202);
    expect(transaction.campaignMessage.updateMany).toHaveBeenCalled();
    expect(transaction.campaignRecipient.update).toHaveBeenCalled();
    if (type === "COMPLAINT" || type === "UNSUBSCRIBED") expect(transaction.optOut.upsert).toHaveBeenCalled();
    if (type === "REPLIED") {
      expect(transaction.reply.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contentPreview: null, providerReplyId: "postmark:event-REPLIED" }) }));
      expect(transaction.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "Human response required." }) }));
    }
  });
});
