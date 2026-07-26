import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";

const providerSchema = z.enum(["resend", "sendgrid", "postmark", "smtp"]);
const eventSchema = z.object({
  providerEventId: z.string().trim().min(1).max(200),
  messageId: z.string().trim().min(1).max(64),
  type: z.enum(["DELIVERED", "BOUNCED", "COMPLAINT", "UNSUBSCRIBED", "REPLIED"]),
  occurredAt: z.coerce.date(),
}).superRefine((event, context) => {
  const age = Date.now() - event.occurredAt.getTime();
  if (age < -5 * 60_000) {
    context.addIssue({ code: "custom", path: ["occurredAt"], message: "Webhook timestamps cannot be in the future." });
  }
  if (age > 30 * 86_400_000) {
    context.addIssue({ code: "custom", path: ["occurredAt"], message: "Webhook timestamps are outside the accepted replay window." });
  }
});

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function validSignature(
  rawBody: Buffer | undefined,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
) {
  if (!rawBody || !timestampHeader || !signatureHeader || !env.EMAIL_WEBHOOK_SECRET) return false;
  if (!/^\d{10}$/.test(timestampHeader)) return false;
  const timestamp = Number(timestampHeader);
  const now = Math.floor(Date.now() / 1_000);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 5 * 60) return false;

  const received = signatureHeader.replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", env.EMAIL_WEBHOOK_SECRET)
    .update(timestampHeader)
    .update(".")
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(received, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function emailHash(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function createEmailWebhookRouter(database: DatabaseClient) {
  const router = Router();

  router.post("/:provider", async (request, response) => {
    if (!env.EMAIL_WEBHOOK_SECRET) {
      throw new AppError(503, "EMAIL_WEBHOOK_DISABLED", "Email provider webhooks are disabled.");
    }
    if (!validSignature(
      request.rawBody,
      request.header("x-webhook-timestamp"),
      request.header("x-webhook-signature"),
    )) {
      throw new UnauthorizedError("The webhook signature is invalid.");
    }
    const provider = providerSchema.parse(request.params.provider);
    const input = eventSchema.parse(request.body);
    const message = await database.campaignMessage.findUnique({
      where: { id: input.messageId },
      include: { recipient: { include: { contact: true, lead: true } } },
    });
    if (!message) {
      response.status(202).json({ data: { accepted: true } });
      return;
    }
    const duplicate = await database.deliveryEvent.findUnique({
      where: {
        provider_providerEventId: { provider, providerEventId: input.providerEventId },
      },
    });
    if (duplicate) {
      response.json({ data: { accepted: true, duplicate: true } });
      return;
    }

    try {
      await database.$transaction(async (transaction) => {
      await transaction.deliveryEvent.create({
        data: {
          userId: message.userId,
          messageId: message.id,
          provider,
          providerEventId: input.providerEventId,
          type: input.type,
          occurredAt: input.occurredAt,
        },
      });
      if (input.type === "DELIVERED") {
        await transaction.campaignMessage.update({
          where: { id: message.id },
          data: { status: "DELIVERED" },
        });
        await transaction.campaignRecipient.update({
          where: { id: message.recipientId },
          data: { status: "DELIVERED" },
        });
        return;
      }

      const email = message.recipient.contact?.publicEmail ?? message.recipient.lead?.email ?? null;
      const stopReason = `PROVIDER_${input.type}`;
      await transaction.campaignMessage.updateMany({
        where: {
          recipientId: message.recipientId,
          status: { in: ["DRAFT", "APPROVED", "QUEUED", "SENT"] },
        },
        data: {
          status: input.type === "BOUNCED" ? "BOUNCED" : "CANCELLED",
          failureReason: stopReason,
          cancelledAt: input.type === "BOUNCED" ? null : input.occurredAt,
        },
      });
      await transaction.campaignRecipient.update({
        where: { id: message.recipientId },
        data: {
          status:
            input.type === "REPLIED"
              ? "REPLIED"
              : input.type === "BOUNCED"
                ? "BOUNCED"
                : "OPTED_OUT",
          stopReason,
          ...(input.type === "REPLIED" ? { repliedAt: input.occurredAt } : {}),
          ...(["COMPLAINT", "UNSUBSCRIBED"].includes(input.type)
            ? { optedOutAt: input.occurredAt }
            : {}),
        },
      });
      if (email && ["COMPLAINT", "UNSUBSCRIBED"].includes(input.type)) {
        await transaction.optOut.upsert({
          where: {
            userId_emailHash: { userId: message.userId, emailHash: emailHash(email) },
          },
          create: {
            userId: message.userId,
            emailHash: emailHash(email),
            source: input.type === "COMPLAINT" ? "COMPLAINT" : "PROVIDER",
            reason: stopReason,
          },
          update: { source: input.type === "COMPLAINT" ? "COMPLAINT" : "PROVIDER", reason: stopReason },
        });
      }
      if (input.type === "REPLIED") {
        await transaction.reply.create({
          data: {
            userId: message.userId,
            recipientId: message.recipientId,
            messageId: message.id,
            providerReplyId: `${provider}:${input.providerEventId}`,
            contentPreview: null,
            receivedAt: input.occurredAt,
          },
        });
        await transaction.task.create({
          data: {
            userId: message.userId,
            campaignId: message.campaignId,
            type: "HUMAN_RESPONSE_REQUIRED",
            title: "Human response required.",
            description: "A provider reported a recipient reply. Follow-ups were stopped.",
          },
        });
      }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        response.json({ data: { accepted: true, duplicate: true } });
        return;
      }
      throw error;
    }
    response.status(202).json({ data: { accepted: true, duplicate: false } });
  });

  return router;
}
