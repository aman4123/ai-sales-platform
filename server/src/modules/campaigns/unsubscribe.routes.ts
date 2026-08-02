import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { DatabaseClient } from "../../lib/prisma.js";
import { verifyUnsubscribeToken } from "./unsubscribe.token.js";

const tokenSchema = z.string().min(20).max(1_000);

function suppressionHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function recipientEmail(recipient: { contact: { publicEmail: string | null } | null; lead: { email: string | null } | null }) {
  return recipient.contact?.publicEmail?.trim().toLowerCase() ?? recipient.lead?.email?.trim().toLowerCase() ?? null;
}

function noStore(response: import("express").Response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("referrer-policy", "no-referrer");
}

export function createUnsubscribeRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/", (request, response) => {
    noStore(response);
    const parsed = tokenSchema.safeParse(request.query.token);
    const valid = parsed.success && verifyUnsubscribeToken(parsed.data);
    response.status(valid ? 200 : 400).type("html").send(valid
      ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title></head><body><main><h1>Stop sales emails</h1><p>Confirm that you no longer want sales emails from this sender.</p><form method="post" action="/api/unsubscribe?token=${parsed.data}"><button type="submit">Unsubscribe</button></form></main></body></html>`
      : "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Invalid link</title></head><body><main><h1>This unsubscribe link is invalid.</h1></main></body></html>");
  });

  router.post("/", async (request, response) => {
    noStore(response);
    const parsed = tokenSchema.safeParse(request.query.token);
    const token = parsed.success ? verifyUnsubscribeToken(parsed.data) : null;
    if (!token) {
      response.status(204).end();
      return;
    }
    const recipient = await database.campaignRecipient.findFirst({
      where: { id: token.recipientId, tenantId: token.tenantId },
      include: {
        contact: { select: { publicEmail: true } },
        lead: { select: { email: true } },
        campaign: { select: { userId: true } },
      },
    });
    const email = recipient ? recipientEmail(recipient) : null;
    if (!recipient || !email) {
      response.status(204).end();
      return;
    }
    const now = new Date();
    await database.$transaction(async (transaction) => {
      await transaction.optOut.upsert({
        where: { tenantId_emailHash: { tenantId: token.tenantId, emailHash: suppressionHash(email) } },
        create: {
          tenantId: token.tenantId,
          userId: recipient.campaign.userId,
          emailHash: suppressionHash(email),
          source: "ONE_CLICK_UNSUBSCRIBE",
          reason: "Recipient used the signed one-click unsubscribe endpoint.",
        },
        update: { source: "ONE_CLICK_UNSUBSCRIBE", reason: "Recipient used the signed one-click unsubscribe endpoint." },
      });
      await transaction.campaignRecipient.updateMany({
        where: { id: recipient.id, tenantId: token.tenantId },
        data: { status: "OPTED_OUT", optedOutAt: now, stopReason: "ONE_CLICK_UNSUBSCRIBE" },
      });
      await transaction.campaignMessage.updateMany({
        where: { recipientId: recipient.id, tenantId: token.tenantId, status: { in: ["DRAFT", "APPROVED", "QUEUED"] } },
        data: { status: "CANCELLED", cancelledAt: now, failureReason: "RECIPIENT_OPTED_OUT" },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: token.tenantId,
          action: "RECIPIENT_ONE_CLICK_UNSUBSCRIBED",
          resourceType: "CampaignRecipient",
          resourceId: recipient.id,
          metadata: { campaignOwnerId: recipient.campaign.userId },
        },
      });
    });
    response.status(204).end();
  });

  return router;
}
