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
  contentPreview: z.string().trim().max(1_000).optional(),
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

export function classifyReplyText(value: string | undefined) {
  const text = value?.trim().toLowerCase() ?? "";
  if (!text) return "UNKNOWN";
  if (/\b(undeliverable|delivery failed|mailbox (?:does not exist|unavailable)|address rejected|hard bounce)\b/.test(text)) return "BOUNCE";
  if (/\b(unsubscribe|remove me|stop (?:emailing|contacting)|do not contact)\b/.test(text)) return "UNSUBSCRIBE";
  if (/\b(spam|complaint|report(?:ed)? you)\b/.test(text)) return "COMPLAINT";
  if (/\b(out of (?:the )?office|automatic reply|on leave)\b/.test(text)) return "OUT_OF_OFFICE";
  if (/\b(wrong (?:person|contact)|not the right person)\b/.test(text)) return "WRONG_CONTACT";
  if (/\b(speak to|contact|forward(?:ed)? to|referr(?:al|ed))\b/.test(text)) return "REFERRAL";
  if (/\b(price|pricing|cost|how much)\b/.test(text)) return "PRICING_QUESTION";
  if (/\b(demo|meeting|calendar|schedule|available (?:on|at)|book a call)\b/.test(text)) return "MEETING_REQUEST";
  if (/\b(how does|what does|feature|integration|product)\b/.test(text) && text.includes("?")) return "PRODUCT_QUESTION";
  if (/\b(follow up|later|next (?:week|month|quarter)|not now)\b/.test(text)) return "FOLLOW_UP_LATER";
  if (/\b(not interested|no thanks|no thank you|decline)\b/.test(text)) return "NOT_INTERESTED";
  if (/\b(concern|objection|already use|contract|security review)\b/.test(text)) return "OBJECTION";
  if (/\b(interested|sounds good|tell me more|yes|open to)\b/.test(text)) return "INTERESTED";
  return "UNKNOWN";
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
      const replyClassification = input.type === "REPLIED" ? classifyReplyText(input.contentPreview) : null;
      const operationalType = input.type === "REPLIED" && replyClassification === "UNSUBSCRIBE"
        ? "UNSUBSCRIBED"
        : input.type === "REPLIED" && replyClassification === "COMPLAINT"
          ? "COMPLAINT"
          : input.type === "REPLIED" && replyClassification === "BOUNCE"
            ? "BOUNCED"
            : input.type;
      await transaction.deliveryEvent.create({
        data: {
          userId: message.userId,
          tenantId: message.tenantId,
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
      const stopReason = `PROVIDER_${operationalType}`;
      await transaction.campaignMessage.updateMany({
        where: {
          recipientId: message.recipientId,
          status: { in: ["DRAFT", "APPROVED", "QUEUED", "SENT"] },
        },
        data: {
          status: operationalType === "BOUNCED" ? "BOUNCED" : "CANCELLED",
          failureReason: stopReason,
          cancelledAt: operationalType === "BOUNCED" ? null : input.occurredAt,
        },
      });
      await transaction.campaignRecipient.update({
        where: { id: message.recipientId },
        data: {
          status:
            operationalType === "REPLIED"
              ? "REPLIED"
              : operationalType === "BOUNCED"
                ? "BOUNCED"
                : "OPTED_OUT",
          stopReason,
          ...(operationalType === "REPLIED" ? { repliedAt: input.occurredAt } : {}),
          ...(["COMPLAINT", "UNSUBSCRIBED"].includes(operationalType)
            ? { optedOutAt: input.occurredAt }
            : {}),
        },
      });
      if (email && ["COMPLAINT", "UNSUBSCRIBED"].includes(operationalType)) {
        const hashedEmail = emailHash(email);
        const suppressionData = {
          source: operationalType === "COMPLAINT" ? "COMPLAINT" : "PROVIDER",
          reason: stopReason,
        };
        await transaction.optOut.upsert({
          where: { tenantId_emailHash: { tenantId: message.tenantId, emailHash: hashedEmail } },
          create: {
            userId: message.userId,
            tenantId: message.tenantId,
            emailHash: hashedEmail,
            ...suppressionData,
          },
          update: suppressionData,
        });
        if (
          operationalType === "COMPLAINT"
          && typeof (transaction as unknown as { globalRecipientSafety?: { upsert?: unknown } })
            .globalRecipientSafety?.upsert === "function"
        ) {
          const domain = email.trim().toLowerCase().split("@")[1] ?? "unknown";
          await transaction.globalRecipientSafety.upsert({
            where: { recipientHash: hashedEmail },
            create: {
              recipientHash: hashedEmail,
              domainHash: emailHash(domain),
              globallySuppressedAt: input.occurredAt,
              suppressionReason: "RECIPIENT_COMPLAINT",
            },
            update: {
              globallySuppressedAt: input.occurredAt,
              suppressionReason: "RECIPIENT_COMPLAINT",
            },
          });
        }
      }
      if (input.type === "REPLIED") {
        await transaction.reply.create({
          data: {
            userId: message.userId,
            tenantId: message.tenantId,
            recipientId: message.recipientId,
            messageId: message.id,
            providerReplyId: `${provider}:${input.providerEventId}`,
            contentPreview: input.contentPreview ?? null,
            classification: replyClassification,
            requiresHuman: !["OUT_OF_OFFICE", "UNSUBSCRIBE", "BOUNCE"].includes(replyClassification ?? "UNKNOWN"),
            receivedAt: input.occurredAt,
          },
        });
        if (!["OUT_OF_OFFICE", "UNSUBSCRIBE", "BOUNCE"].includes(replyClassification ?? "UNKNOWN")) {
          await transaction.task.create({
            data: {
              userId: message.userId,
              tenantId: message.tenantId,
              campaignId: message.campaignId,
              type: "HUMAN_RESPONSE_REQUIRED",
              title: replyClassification === "MEETING_REQUEST" ? "Meeting scheduling required." : "Human response required.",
              description: `A provider reported a ${replyClassification?.toLowerCase().replaceAll("_", " ")} reply. Follow-ups were stopped.`,
            },
          });
        }
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
