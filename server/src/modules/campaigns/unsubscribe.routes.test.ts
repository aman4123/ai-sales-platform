import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../lib/prisma.js";
import { createUnsubscribeRouter } from "./unsubscribe.routes.js";
import { createUnsubscribeToken } from "./unsubscribe.token.js";

function fixture() {
  const recipient = {
    id: "recipient-1",
    tenantId: "tenant-1",
    contact: { publicEmail: "buyer@example.test" },
    lead: null,
    campaign: { userId: "owner-1" },
  };
  const database = {
    campaignRecipient: {
      findFirst: vi.fn().mockResolvedValue(recipient),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    campaignMessage: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    optOut: { upsert: vi.fn().mockResolvedValue({ id: "optout-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    $transaction: vi.fn(async (action: (transaction: unknown) => unknown) => action(database)),
  };
  const app = express();
  app.use(express.json());
  app.use("/api/unsubscribe", createUnsubscribeRouter(database as unknown as DatabaseClient));
  return { app, database };
}

describe("one-click unsubscribe", () => {
  it("suppresses the tenant recipient and cancels pending messages from a signed URL", async () => {
    const { app, database } = fixture();
    const token = createUnsubscribeToken({ tenantId: "tenant-1", recipientId: "recipient-1" });

    const response = await request(app).post(`/api/unsubscribe?token=${encodeURIComponent(token)}`).send({ ListUnsubscribe: "One-Click" });

    expect(response.status).toBe(204);
    expect(database.optOut.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ tenantId: "tenant-1", userId: "owner-1", source: "ONE_CLICK_UNSUBSCRIBE" }),
    }));
    expect(database.campaignRecipient.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "OPTED_OUT", stopReason: "ONE_CLICK_UNSUBSCRIBE" }),
    }));
    expect(database.campaignMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELLED", failureReason: "RECIPIENT_OPTED_OUT" }),
    }));
  });

  it("does not disclose whether a tampered token identifies a recipient", async () => {
    const { app, database } = fixture();
    const token = createUnsubscribeToken({ tenantId: "tenant-1", recipientId: "recipient-1" });

    expect((await request(app).post(`/api/unsubscribe?token=${encodeURIComponent(`${token}x`)}`)).status).toBe(204);
    expect(database.campaignRecipient.findFirst).not.toHaveBeenCalled();
    expect(database.optOut.upsert).not.toHaveBeenCalled();
  });
});
