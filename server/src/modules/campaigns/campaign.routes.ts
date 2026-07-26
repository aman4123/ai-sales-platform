import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { EmailService } from "../../lib/email.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { consumeMonthlyAiRequest, resolveAiProvider } from "../ai/ai.routes.js";
import { askGroq } from "../ai/ai.service.js";
import {
  groundedEmailPromptVersion,
  groundedEmailSystemPrompt,
  groundedEmailUserPrompt,
  validateGeneratedEmail,
  type GroundedEmailInput,
  type VerifiedEmailFact,
} from "./campaign.email.js";
import { automationStopReason, canQueueCampaign, canSendCampaign, hasCurrentApproval } from "./campaign.policy.js";

const toneSchema = z.enum(["Professional", "Friendly", "Sales", "Formal"]);
const emailHeaderSchema = (maximum: number) =>
  z.string().trim().min(1).max(maximum).refine((value) => !/[\r\n]/.test(value), {
    message: "Email header values cannot contain line breaks.",
  });
const sequenceSchema = z.object({
  followUps: z
    .array(
      z.object({
        delayDays: z.number().int().min(1).max(30),
        enabled: z.boolean(),
      }),
    )
    .max(3)
    .default([]),
});
const scheduleSchema = z.object({
  timezone: z.string().trim().min(1).max(80),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/),
});
const senderSchema = z.object({
  displayName: emailHeaderSchema(120),
  email: z.string().trim().toLowerCase().email().max(254),
});
const campaignSchema = z.object({
  idealCustomerProfileId: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(2).max(160),
  salesGoal: z.string().trim().min(2).max(500),
  productService: z.string().trim().min(2).max(500),
  valueProposition: z.string().trim().min(2).max(1_000),
  audienceFilters: z.record(z.string(), z.unknown()).default({}),
  senderIdentity: senderSchema,
  tone: toneSchema.default("Professional"),
  sequenceConfig: sequenceSchema,
  schedule: scheduleSchema,
  dailySendingLimit: z.number().int().min(1).max(1_000),
});
const updateCampaignSchema = campaignSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one campaign field is required.",
});
const recipientSchema = z
  .object({
    leadIds: z.array(z.string().min(1).max(64)).max(100).default([]),
    contactIds: z.array(z.string().min(1).max(64)).max(100).default([]),
  })
  .refine((value) => value.leadIds.length + value.contactIds.length > 0, {
    message: "Select at least one recipient.",
  });
const approvalSchema = z.object({
  approved: z.literal(true),
  approvalType: z.enum(["INITIAL_ONLY", "SEQUENCE"]),
});
const confirmationSchema = z.object({ confirm: z.literal(true) });
const replySchema = z.object({
  providerReplyId: z.string().trim().min(1).max(200).optional(),
  contentPreview: z.string().trim().max(500).optional(),
  classification: z.string().trim().max(80).optional(),
});
const optOutSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  reason: z.string().trim().max(500).optional(),
  source: z.enum(["RECIPIENT", "USER", "PROVIDER", "COMPLAINT"]),
});
const editMessageSchema = z.object({
  subject: emailHeaderSchema(160),
  greeting: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(3_000),
  cta: z.string().trim().min(1).max(500),
  closing: z.string().trim().min(1).max(200),
});
const idSchema = z.string().min(1).max(64);

export function suppressionHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function messageKey(campaignId: string, recipientId: string, step: number, version: number) {
  return createHash("sha256")
    .update(`${campaignId}\0${recipientId}\0${step}\0${version}`)
    .digest("hex");
}

function recipientEmail(recipient: {
  contact: { publicEmail: string | null } | null;
  lead: { email: string | null } | null;
}) {
  return recipient.contact?.publicEmail ?? recipient.lead?.email ?? null;
}

function messageKind(step: number) {
  return (["INITIAL", "FOLLOW_UP_1", "FOLLOW_UP_2", "FINAL_FOLLOW_UP"] as const)[step]!;
}

async function ownedCampaign(database: DatabaseClient, id: string, userId: string) {
  const campaign = await database.campaign.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  return campaign;
}

async function invalidateApproval(database: DatabaseClient, campaignId: string, userId: string) {
  await database.$transaction([
    database.campaign.update({
      where: { id: campaignId, userId },
      data: {
        contentVersion: { increment: 1 },
        approvedVersion: null,
        status: "DRAFT",
      },
    }),
    database.campaignMessage.updateMany({
      where: { campaignId, userId, status: { in: ["DRAFT", "APPROVED", "QUEUED"] } },
      data: { status: "DRAFT", queuedAt: null },
    }),
    database.campaignRecipient.updateMany({
      where: { campaignId, status: { in: ["PENDING", "APPROVED", "QUEUED"] } },
      data: { status: "PENDING" },
    }),
  ]);
}

function factsForResearch(
  result: {
    companyName: string | null;
    industry: string | null;
    evidence: Array<{
      id: string;
      field: string;
      value: string;
      verificationStatus: string;
    }>;
  },
): VerifiedEmailFact[] {
  const supported = new Set(["companyName", "website", "industry", "description", "headquarters"]);
  const groups = new Map<string, VerifiedEmailFact>();
  for (const item of result.evidence) {
    if (!supported.has(item.field) || item.verificationStatus === "UNVERIFIED") continue;
    const key = `${item.field}\0${item.value}`;
    const existing = groups.get(key);
    if (existing) existing.evidenceIds.push(item.id);
    else groups.set(key, { field: item.field, value: item.value, evidenceIds: [item.id] });
  }
  return [...groups.values()];
}

export function createCampaignRouter(
  database: DatabaseClient,
  redis: RedisClient | null,
  emailService: EmailService,
) {
  const router = Router();

  router.get("/", async (request, response) => {
    const campaigns = await database.campaign.findMany({
      where: { userId: request.user!.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { recipients: true, messages: true, approvals: true } } },
    });
    response.json({ data: { campaigns } });
  });

  router.post("/", async (request, response) => {
    const input = campaignSchema.parse(request.body);
    if (input.idealCustomerProfileId) {
      const profile = await database.idealCustomerProfile.findFirst({
        where: { id: input.idealCustomerProfileId, userId: request.user!.id, deletedAt: null },
        select: { id: true },
      });
      if (!profile) throw new NotFoundError("Ideal customer profile");
    }
    const campaign = await database.campaign.create({
      data: {
        userId: request.user!.id,
        idealCustomerProfileId: input.idealCustomerProfileId ?? null,
        name: input.name,
        salesGoal: input.salesGoal,
        productService: input.productService,
        valueProposition: input.valueProposition,
        audienceFilters: input.audienceFilters as Prisma.InputJsonValue,
        senderIdentity: input.senderIdentity,
        emailTemplate: { tone: input.tone },
        sequenceConfig: input.sequenceConfig,
        schedule: input.schedule,
        dailySendingLimit: Math.min(input.dailySendingLimit, env.OUTBOUND_DAILY_LIMIT),
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        action: "CAMPAIGN_CREATED",
        resourceType: "Campaign",
        resourceId: campaign.id,
        requestId: request.id,
      },
    });
    response.status(201).json({ data: { campaign } });
  });

  router.get("/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const campaign = await database.campaign.findFirst({
      where: { id, userId: request.user!.id, deletedAt: null },
      include: {
        recipients: { include: { lead: true, contact: true, company: true } },
        messages: { orderBy: [{ recipientId: "asc" }, { sequenceStep: "asc" }] },
        approvals: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    response.json({ data: { campaign } });
  });

  router.put("/:id", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = updateCampaignSchema.parse(request.body);
    await ownedCampaign(database, id, request.user!.id);
    if (input.idealCustomerProfileId) {
      const profile = await database.idealCustomerProfile.findFirst({
        where: { id: input.idealCustomerProfileId, userId: request.user!.id, deletedAt: null },
      });
      if (!profile) throw new NotFoundError("Ideal customer profile");
    }
    await invalidateApproval(database, id, request.user!.id);
    const campaign = await database.campaign.update({
      where: { id, userId: request.user!.id },
      data: {
        ...(input.idealCustomerProfileId !== undefined
          ? { idealCustomerProfileId: input.idealCustomerProfileId }
          : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.salesGoal !== undefined ? { salesGoal: input.salesGoal } : {}),
        ...(input.productService !== undefined ? { productService: input.productService } : {}),
        ...(input.valueProposition !== undefined
          ? { valueProposition: input.valueProposition }
          : {}),
        ...(input.audienceFilters !== undefined ? { audienceFilters: input.audienceFilters } : {}),
        ...(input.senderIdentity !== undefined ? { senderIdentity: input.senderIdentity } : {}),
        ...(input.tone !== undefined ? { emailTemplate: { tone: input.tone } } : {}),
        ...(input.sequenceConfig !== undefined ? { sequenceConfig: input.sequenceConfig } : {}),
        ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
        ...(input.dailySendingLimit !== undefined
          ? { dailySendingLimit: Math.min(input.dailySendingLimit, env.OUTBOUND_DAILY_LIMIT) }
          : {}),
      } as Prisma.CampaignUncheckedUpdateInput,
    });
    response.json({ data: { campaign, approvalInvalidated: true } });
  });

  router.post("/:id/recipients", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = recipientSchema.parse(request.body);
    await ownedCampaign(database, id, request.user!.id);
    const [leads, contacts] = await Promise.all([
      database.lead.findMany({
        where: { id: { in: input.leadIds }, userId: request.user!.id },
      }),
      database.contact.findMany({
        where: {
          id: { in: input.contactIds },
          userId: request.user!.id,
          deletedAt: null,
          verificationStatus: { not: "UNVERIFIED" },
        },
      }),
    ]);
    if (leads.length !== new Set(input.leadIds).size || contacts.length !== new Set(input.contactIds).size) {
      throw new AppError(
        422,
        "RECIPIENTS_INVALID",
        "Every recipient must be owned by the user and public contact data must be verified.",
      );
    }
    await invalidateApproval(database, id, request.user!.id);
    for (const lead of leads) {
      await database.campaignRecipient.upsert({
        where: { campaignId_leadId: { campaignId: id, leadId: lead.id } },
        create: {
          campaignId: id,
          leadId: lead.id,
          companyId: lead.companyRecordId,
          contactId: lead.contactRecordId,
        },
        update: { status: "PENDING", stopReason: null },
      });
    }
    for (const contact of contacts) {
      await database.campaignRecipient.upsert({
        where: { campaignId_contactId: { campaignId: id, contactId: contact.id } },
        create: { campaignId: id, contactId: contact.id, companyId: contact.companyId },
        update: { status: "PENDING", stopReason: null },
      });
    }
    response.status(201).json({
      data: { added: leads.length + contacts.length, approvalInvalidated: true },
    });
  });

  router.post("/:id/drafts", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    confirmationSchema.parse(request.body);
    const campaign = await database.campaign.findFirst({
      where: { id, userId: request.user!.id, deletedAt: null },
      include: {
        recipients: {
          where: { status: { in: ["PENDING", "APPROVED"] } },
          include: {
            lead: { include: { companyRecord: true } },
            contact: { include: { company: true } },
            company: {
              include: {
                researchResults: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  include: { evidence: true },
                },
              },
            },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    const settings = await database.userSettings.findUnique({
      where: { userId: request.user!.id },
    });
    const provider = resolveAiProvider(settings?.aiProvider ?? "MOCK");
    if (provider !== "GROQ") {
      throw new AppError(503, "AI_PROVIDER_NOT_CONFIGURED", "Groq is required for grounded drafts.");
    }
    const template = z.object({ tone: toneSchema }).safeParse(campaign.emailTemplate);
    const sequence = sequenceSchema.safeParse(campaign.sequenceConfig);
    if (!template.success || !sequence.success) {
      throw new AppError(422, "CAMPAIGN_CONFIGURATION_INVALID", "The campaign configuration is invalid.");
    }
    const steps = [
      { step: 0, delayDays: 0 },
      ...sequence.data.followUps
        .filter((item) => item.enabled)
        .slice(0, env.OUTBOUND_FOLLOW_UP_LIMIT)
        .map((item, index) => ({ step: index + 1, delayDays: item.delayDays })),
    ];
    let created = 0;
    const skipped: Array<{ recipientId: string; reason: string }> = [];

    for (const recipient of campaign.recipients) {
      const company = recipient.company ?? recipient.contact?.company ?? recipient.lead?.companyRecord;
      const research = recipient.company?.researchResults[0];
      if (!company || !research) {
        skipped.push({ recipientId: recipient.id, reason: "VERIFIED_EVIDENCE_REQUIRED" });
        continue;
      }
      const facts = factsForResearch(research);
      if (facts.length === 0 || !facts.some((fact) => fact.field === "companyName")) {
        skipped.push({ recipientId: recipient.id, reason: "VERIFIED_EVIDENCE_REQUIRED" });
        continue;
      }
      const contactName =
        recipient.contact && recipient.contact.verificationStatus !== "UNVERIFIED"
          ? recipient.contact.name
          : undefined;
      const baseInput: GroundedEmailInput = {
        company: research.companyName ?? company.name,
        ...(contactName ? { contact: contactName } : {}),
        ...(research.industry ? { industry: research.industry } : {}),
        tone: template.data.tone,
        savedSignature: settings?.signature ?? "",
        productService: campaign.productService,
        valueProposition: campaign.valueProposition,
        campaignGoal: campaign.salesGoal,
        verifiedFacts: facts,
      };

      for (const step of steps) {
        const existing = await database.campaignMessage.findUnique({
          where: {
            recipientId_sequenceStep_contentVersion: {
              recipientId: recipient.id,
              sequenceStep: step.step,
              contentVersion: campaign.contentVersion,
            },
          },
        });
        if (existing) continue;
        await consumeMonthlyAiRequest(redis);
        const raw = await askGroq(
          groundedEmailSystemPrompt,
          groundedEmailUserPrompt({
            ...baseInput,
            campaignGoal: `${baseInput.campaignGoal} Draft stage: ${messageKind(step.step)}.`,
          }),
          { temperature: 0.65 },
        );
        const draft = validateGeneratedEmail(raw, baseInput);
        if (!draft) {
          skipped.push({ recipientId: recipient.id, reason: "UNSUPPORTED_AI_OUTPUT_REJECTED" });
          continue;
        }
        await database.campaignMessage.create({
          data: {
            userId: request.user!.id,
            campaignId: campaign.id,
            recipientId: recipient.id,
            kind: messageKind(step.step),
            sequenceStep: step.step,
            subject: draft.subject,
            greeting: draft.greeting,
            body: draft.body,
            cta: draft.cta,
            closing: draft.closing,
            signature: draft.signature,
            factsUsed: {
              facts: draft.factsUsed,
              wordCount: draft.wordCount,
              averageWordsPerSentence: draft.averageWordsPerSentence,
              spamWarnings: draft.spamWarnings,
            } as unknown as Prisma.InputJsonValue,
            evidenceIds: draft.evidenceIds,
            promptVersion: groundedEmailPromptVersion,
            contentVersion: campaign.contentVersion,
            scheduledAt: new Date(Date.now() + step.delayDays * 86_400_000),
            idempotencyKey: messageKey(
              campaign.id,
              recipient.id,
              step.step,
              campaign.contentVersion,
            ),
          },
        });
        created += 1;
      }
    }

    if (created > 0) {
      await database.campaign.update({
        where: { id: campaign.id, userId: request.user!.id },
        data: { status: "READY_FOR_REVIEW" },
      });
    }
    response.status(201).json({ data: { created, skipped, status: created ? "READY_FOR_REVIEW" : campaign.status } });
  });

  router.put("/messages/:messageId", async (request, response) => {
    const messageId = idSchema.parse(request.params.messageId);
    const input = editMessageSchema.parse(request.body);
    const existing = await database.campaignMessage.findFirst({
      where: { id: messageId, userId: request.user!.id },
      include: { campaign: true },
    });
    if (!existing || existing.campaign.deletedAt) throw new NotFoundError("Campaign message");
    if (existing.status === "SENT" || existing.status === "DELIVERED") {
      throw new AppError(409, "MESSAGE_IMMUTABLE", "Sent messages cannot be edited.");
    }
    const newVersion = existing.campaign.contentVersion + 1;
    await database.$transaction([
      database.campaign.update({
        where: { id: existing.campaignId, userId: request.user!.id },
        data: { contentVersion: newVersion, approvedVersion: null, status: "READY_FOR_REVIEW" },
      }),
      database.campaignMessage.updateMany({
        where: {
          campaignId: existing.campaignId,
          userId: request.user!.id,
          status: { in: ["DRAFT", "APPROVED", "QUEUED"] },
        },
        data: { contentVersion: newVersion, status: "DRAFT", queuedAt: null },
      }),
      database.campaignMessage.update({
        where: { id: messageId, userId: request.user!.id },
        data: input,
      }),
      database.campaignRecipient.updateMany({
        where: {
          campaignId: existing.campaignId,
          status: { in: ["PENDING", "APPROVED", "QUEUED"] },
        },
        data: { status: "PENDING" },
      }),
    ]);
    response.json({ data: { contentVersion: newVersion, approvalInvalidated: true } });
  });

  router.post("/:id/approve", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = approvalSchema.parse(request.body);
    const campaign = await database.campaign.findFirst({
      where: { id, userId: request.user!.id, deletedAt: null },
      include: {
        recipients: true,
        messages: { where: { status: "DRAFT" }, orderBy: { sequenceStep: "asc" } },
      },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    if (campaign.messages.length === 0 || campaign.recipients.length === 0) {
      throw new AppError(422, "CAMPAIGN_NOT_REVIEWABLE", "Recipients and draft messages are required.");
    }
    const initialRecipients = new Set(
      campaign.messages.filter((message) => message.kind === "INITIAL").map((message) => message.recipientId),
    );
    if (initialRecipients.size !== campaign.recipients.length) {
      throw new AppError(422, "CAMPAIGN_DRAFTS_INCOMPLETE", "Every recipient needs an initial draft.");
    }
    const approvedMessages =
      input.approvalType === "SEQUENCE"
        ? campaign.messages
        : campaign.messages.filter((message) => message.kind === "INITIAL");
    const approval = await database.$transaction(async (transaction) => {
      const record = await transaction.campaignApproval.create({
        data: {
          campaignId: campaign.id,
          approvedById: request.user!.id,
          approvalType: input.approvalType,
          contentVersion: campaign.contentVersion,
          recipientCount: campaign.recipients.length,
          messageSnapshot: approvedMessages.map((message) => ({
            id: message.id,
            recipientId: message.recipientId,
            kind: message.kind,
            subject: message.subject,
            greeting: message.greeting,
            body: message.body,
            cta: message.cta,
            closing: message.closing,
            signature: message.signature,
            contentVersion: message.contentVersion,
          })) as Prisma.InputJsonValue,
          sequenceSnapshot: campaign.sequenceConfig as Prisma.InputJsonValue,
          limitsSnapshot: {
            dailySendingLimit: campaign.dailySendingLimit,
            globalDailyLimit: env.OUTBOUND_DAILY_LIMIT,
          },
        },
      });
      await transaction.campaign.update({
        where: { id: campaign.id, userId: request.user!.id },
        data: { status: "APPROVED", approvedVersion: campaign.contentVersion },
      });
      await transaction.campaignRecipient.updateMany({
        where: { campaignId: campaign.id, status: "PENDING" },
        data: { status: "APPROVED" },
      });
      await transaction.campaignMessage.updateMany({
        where: { id: { in: approvedMessages.map((message) => message.id) }, status: "DRAFT" },
        data: { status: "APPROVED" },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          action: "CAMPAIGN_APPROVED",
          resourceType: "Campaign",
          resourceId: campaign.id,
          requestId: request.id,
          metadata: { approvalId: record.id, contentVersion: campaign.contentVersion },
        },
      });
      return record;
    });
    response.status(201).json({ data: { approval } });
  });

  router.post("/:id/queue", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    confirmationSchema.parse(request.body);
    const campaign = await database.campaign.findFirst({
      where: { id, userId: request.user!.id, deletedAt: null },
      include: {
        recipients: { include: { contact: true, lead: true } },
        messages: { where: { status: "APPROVED" } },
        approvals: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    if (!canQueueCampaign({
      ...campaign,
      latestApprovalVersion: campaign.approvals[0]?.contentVersion ?? null,
    })) {
      throw new AppError(409, "CAMPAIGN_APPROVAL_REQUIRED", "The current campaign version requires approval.");
    }

    const suppressedRecipientIds = new Set<string>();
    for (const recipient of campaign.recipients) {
      const email = recipientEmail(recipient);
      if (!email) {
        suppressedRecipientIds.add(recipient.id);
        continue;
      }
      const suppression = await database.optOut.findUnique({
        where: { userId_emailHash: { userId: request.user!.id, emailHash: suppressionHash(email) } },
      });
      if (suppression || recipient.optedOutAt || recipient.repliedAt) suppressedRecipientIds.add(recipient.id);
    }

    const queuedIds = campaign.messages
      .filter((message) => !suppressedRecipientIds.has(message.recipientId))
      .map((message) => message.id);
    await database.$transaction([
      database.campaignMessage.updateMany({
        where: { id: { in: queuedIds }, status: "APPROVED" },
        data: { status: "QUEUED", queuedAt: new Date() },
      }),
      database.campaignMessage.updateMany({
        where: {
          campaignId: campaign.id,
          recipientId: { in: [...suppressedRecipientIds] },
          status: { in: ["DRAFT", "APPROVED", "QUEUED"] },
        },
        data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "RECIPIENT_SUPPRESSED" },
      }),
      database.campaignRecipient.updateMany({
        where: { id: { in: queuedIds.length ? campaign.recipients.filter((item) => !suppressedRecipientIds.has(item.id)).map((item) => item.id) : [] } },
        data: { status: "QUEUED" },
      }),
      database.campaignRecipient.updateMany({
        where: { id: { in: [...suppressedRecipientIds] } },
        data: { status: "OPTED_OUT", stopReason: "RECIPIENT_SUPPRESSED" },
      }),
      database.campaign.update({
        where: { id: campaign.id, userId: request.user!.id },
        data: { status: queuedIds.length > 0 ? "SCHEDULED" : "PAUSED" },
      }),
    ]);
    response.json({ data: { queued: queuedIds.length, suppressed: suppressedRecipientIds.size } });
  });

  router.post("/:id/pause", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    confirmationSchema.parse(request.body);
    const campaign = await database.campaign.findFirst({
      where: { id, userId: request.user!.id, deletedAt: null },
      include: { approvals: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    if (!["SCHEDULED", "RUNNING"].includes(campaign.status)) {
      throw new AppError(409, "CAMPAIGN_NOT_PAUSABLE", "Only a scheduled or running campaign can be paused.");
    }
    const updated = await database.$transaction(async (transaction) => {
      const record = await transaction.campaign.update({
        where: { id, userId: request.user!.id },
        data: { status: "PAUSED", pausedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          action: "CAMPAIGN_PAUSED",
          resourceType: "Campaign",
          resourceId: id,
          requestId: request.id,
        },
      });
      return record;
    });
    response.json({ data: { campaign: updated } });
  });

  router.post("/:id/resume", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    confirmationSchema.parse(request.body);
    const campaign = await database.campaign.findFirst({
      where: { id, userId: request.user!.id, deletedAt: null },
      include: { approvals: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    if (campaign.status !== "PAUSED") {
      throw new AppError(409, "CAMPAIGN_NOT_PAUSED", "Only a paused campaign can be resumed.");
    }
    if (!hasCurrentApproval({
      ...campaign,
      latestApprovalVersion: campaign.approvals[0]?.contentVersion ?? null,
    })) {
      throw new AppError(409, "CAMPAIGN_APPROVAL_REQUIRED", "The current campaign version requires approval.");
    }
    const queuedMessages = await database.campaignMessage.count({
      where: { campaignId: id, userId: request.user!.id, status: "QUEUED" },
    });
    if (queuedMessages === 0) {
      throw new AppError(409, "CAMPAIGN_QUEUE_EMPTY", "No approved queued messages are available to resume.");
    }
    const updated = await database.$transaction(async (transaction) => {
      const record = await transaction.campaign.update({
        where: { id, userId: request.user!.id },
        data: { status: "SCHEDULED", pausedAt: null },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          action: "CAMPAIGN_RESUMED",
          resourceType: "Campaign",
          resourceId: id,
          requestId: request.id,
        },
      });
      return record;
    });
    response.json({ data: { campaign: updated } });
  });

  router.post("/:id/stop", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    confirmationSchema.parse(request.body);
    const campaign = await ownedCampaign(database, id, request.user!.id);
    if (["COMPLETED", "CANCELLED"].includes(campaign.status)) {
      throw new AppError(409, "CAMPAIGN_ALREADY_TERMINAL", "This campaign has already finished or been stopped.");
    }
    const now = new Date();
    const updated = await database.$transaction(async (transaction) => {
      await transaction.campaignMessage.updateMany({
        where: {
          campaignId: id,
          userId: request.user!.id,
          status: { in: ["DRAFT", "APPROVED", "QUEUED"] },
        },
        data: { status: "CANCELLED", cancelledAt: now, failureReason: "CAMPAIGN_STOPPED_BY_USER" },
      });
      await transaction.campaignRecipient.updateMany({
        where: { campaignId: id, status: { in: ["PENDING", "APPROVED", "QUEUED"] } },
        data: { status: "CANCELLED", stopReason: "CAMPAIGN_STOPPED_BY_USER" },
      });
      const record = await transaction.campaign.update({
        where: { id, userId: request.user!.id },
        data: { status: "CANCELLED", pausedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: request.user!.id,
          action: "CAMPAIGN_STOPPED",
          resourceType: "Campaign",
          resourceId: id,
          requestId: request.id,
        },
      });
      return record;
    });
    response.json({ data: { campaign: updated, pendingMessagesCancelled: true } });
  });

  router.post("/:id/send-approved", async (request, response) => {
    const id = idSchema.parse(request.params.id);
    confirmationSchema.parse(request.body);
    if (!env.OUTBOUND_EMAIL_ENABLED || !emailService.sendCampaign) {
      throw new AppError(
        503,
        "OUTBOUND_EMAIL_DISABLED",
        "Outbound campaign email is disabled until a provider is explicitly configured.",
      );
    }
    const campaign = await database.campaign.findFirst({
      where: { id, userId: request.user!.id, deletedAt: null },
      include: { approvals: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    if (!canSendCampaign({
      ...campaign,
      latestApprovalVersion: campaign.approvals[0]?.contentVersion ?? null,
    })) {
      throw new AppError(409, "CAMPAIGN_NOT_SENDABLE", "Only the current approved campaign may send.");
    }
    const settings = await database.userSettings.findUnique({ where: { userId: request.user!.id } });
    if (!settings?.unsubscribeFooter.trim()) {
      throw new AppError(422, "UNSUBSCRIBE_FOOTER_REQUIRED", "Configure an unsubscribe footer before sending.");
    }
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const sentToday = await database.campaignMessage.count({
      where: { userId: request.user!.id, sentAt: { gte: dayStart } },
    });
    const limit = Math.min(
      campaign.dailySendingLimit,
      settings.campaignDailyLimit,
      env.OUTBOUND_DAILY_LIMIT,
    );
    const available = Math.max(0, limit - sentToday);
    if (automationStopReason({ replied: false, optedOut: false, permanentlyFailed: false, complaint: false, confidence: undefined, campaignStatus: campaign.status, limitReached: available === 0 })) {
      const remaining = await database.campaignMessage.count({
        where: { campaignId: campaign.id, userId: request.user!.id, status: "QUEUED" },
      });
      response.json({ data: { sent: 0, failed: 0, remaining, dailyRemaining: 0 } });
      return;
    }
    const messages = await database.campaignMessage.findMany({
      where: {
        campaignId: campaign.id,
        userId: request.user!.id,
        contentVersion: campaign.contentVersion,
        status: "QUEUED",
        scheduledAt: { lte: new Date() },
        attemptCount: { lt: 3 },
        recipient: {
          status: { in: ["QUEUED", "SENT", "DELIVERED"] },
          repliedAt: null,
          optedOutAt: null,
        },
      },
      include: { recipient: { include: { contact: true, lead: true } } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: available,
    });
    let sent = 0;
    let failed = 0;
    for (const message of messages) {
      const email = recipientEmail(message.recipient);
      const confidenceStop = automationStopReason({
        replied: Boolean(message.recipient.repliedAt),
        optedOut: Boolean(message.recipient.optedOutAt),
        permanentlyFailed: message.recipient.status === "BOUNCED" || message.recipient.status === "FAILED",
        complaint: message.recipient.stopReason === "RECIPIENT_COMPLAINT",
        confidence: message.recipient.lead?.confidence,
        campaignStatus: campaign.status,
        limitReached: false,
      });
      const suppressed = email
        ? await database.optOut.findUnique({
            where: {
              userId_emailHash: { userId: request.user!.id, emailHash: suppressionHash(email) },
            },
          })
        : true;
      if (!email || suppressed || confidenceStop) {
        await database.$transaction([
          database.campaignMessage.update({
            where: { id: message.id, userId: request.user!.id },
            data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: confidenceStop ?? "RECIPIENT_SUPPRESSED" },
          }),
          database.campaignRecipient.update({
            where: { id: message.recipientId },
            data: confidenceStop
              ? { status: "CANCELLED", stopReason: confidenceStop }
              : { status: "OPTED_OUT", stopReason: "RECIPIENT_SUPPRESSED" },
          }),
        ]);
        continue;
      }
      try {
        await emailService.sendCampaign({
          to: email,
          subject: message.subject,
          greeting: message.greeting,
          body: message.body,
          cta: message.cta,
          closing: message.closing,
          signature: message.signature,
          unsubscribeFooter: settings.unsubscribeFooter,
        });
        await database.$transaction([
          database.campaignMessage.update({
            where: { id: message.id, userId: request.user!.id },
            data: {
              status: "SENT",
              sentAt: new Date(),
              lastAttemptAt: new Date(),
              attemptCount: { increment: 1 },
            },
          }),
          database.campaignRecipient.update({
            where: { id: message.recipientId },
            data: { status: "SENT" },
          }),
        ]);
        sent += 1;
      } catch {
        const finalAttempt = message.attemptCount + 1 >= message.maxAttempts;
        await database.campaignMessage.update({
          where: { id: message.id, userId: request.user!.id },
          data: {
            status: finalAttempt ? "FAILED" : "QUEUED",
            failureReason: "EMAIL_PROVIDER_UNAVAILABLE",
            lastAttemptAt: new Date(),
            attemptCount: { increment: 1 },
          },
        });
        failed += 1;
      }
    }
    const remaining = await database.campaignMessage.count({
      where: { campaignId: campaign.id, status: "QUEUED" },
    });
    await database.campaign.update({
      where: { id: campaign.id, userId: request.user!.id },
      data: {
        status: remaining > 0 ? "RUNNING" : "COMPLETED",
        ...(campaign.launchedAt ? {} : { launchedAt: new Date() }),
        ...(remaining === 0 ? { completedAt: new Date() } : {}),
      },
    });
    response.json({ data: { sent, failed, remaining, dailyRemaining: Math.max(0, available - sent) } });
  });

  router.post("/recipients/:recipientId/replies", async (request, response) => {
    const recipientId = idSchema.parse(request.params.recipientId);
    const input = replySchema.parse(request.body);
    const recipient = await database.campaignRecipient.findFirst({
      where: { id: recipientId, campaign: { userId: request.user!.id } },
    });
    if (!recipient) throw new NotFoundError("Campaign recipient");
    const reply = await database.$transaction(async (transaction) => {
      const created = await transaction.reply.create({
        data: {
          userId: request.user!.id,
          recipientId,
          ...(input.providerReplyId !== undefined
            ? { providerReplyId: input.providerReplyId }
            : {}),
          ...(input.classification !== undefined ? { classification: input.classification } : {}),
          ...(input.contentPreview !== undefined ? { contentPreview: input.contentPreview } : {}),
          requiresHuman: true,
          receivedAt: new Date(),
        },
      });
      await transaction.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: "REPLIED", repliedAt: new Date(), stopReason: "RECIPIENT_REPLIED" },
      });
      await transaction.campaignMessage.updateMany({
        where: { recipientId, status: { in: ["DRAFT", "APPROVED", "QUEUED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "RECIPIENT_REPLIED" },
      });
      await transaction.task.create({
        data: {
          userId: request.user!.id,
          campaignId: recipient.campaignId,
          type: "HUMAN_RESPONSE_REQUIRED",
          title: "Human response required.",
          description: "A campaign recipient replied. Automated follow-ups were stopped.",
        },
      });
      return created;
    });
    response.status(201).json({ data: { reply, automationStopped: true } });
  });

  router.post("/opt-outs", async (request, response) => {
    const input = optOutSchema.parse(request.body);
    const emailHash = suppressionHash(input.email);
    const [contacts, leads] = await Promise.all([
      database.contact.findMany({
        where: { userId: request.user!.id, publicEmail: { equals: input.email, mode: "insensitive" } },
        select: { id: true },
      }),
      database.lead.findMany({
        where: { userId: request.user!.id, email: { equals: input.email, mode: "insensitive" } },
        select: { id: true },
      }),
    ]);
    const recipientIds = (
      await database.campaignRecipient.findMany({
        where: {
          campaign: { userId: request.user!.id },
          OR: [
            { contactId: { in: contacts.map((item) => item.id) } },
            { leadId: { in: leads.map((item) => item.id) } },
          ],
        },
        select: { id: true },
      })
    ).map((item) => item.id);
    const optOut = await database.$transaction(async (transaction) => {
      const record = await transaction.optOut.upsert({
        where: { userId_emailHash: { userId: request.user!.id, emailHash } },
        create: {
          userId: request.user!.id,
          emailHash,
          reason: input.reason ?? null,
          source: input.source,
        },
        update: { reason: input.reason ?? null, source: input.source },
      });
      await transaction.contact.updateMany({
        where: { id: { in: contacts.map((item) => item.id) }, userId: request.user!.id },
        data: { optedOutAt: new Date() },
      });
      await transaction.campaignRecipient.updateMany({
        where: { id: { in: recipientIds } },
        data: { status: "OPTED_OUT", optedOutAt: new Date(), stopReason: "RECIPIENT_OPTED_OUT" },
      });
      await transaction.campaignMessage.updateMany({
        where: { recipientId: { in: recipientIds }, status: { in: ["DRAFT", "APPROVED", "QUEUED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "RECIPIENT_OPTED_OUT" },
      });
      return record;
    });
    response.status(201).json({ data: { optOut, stoppedRecipients: recipientIds.length } });
  });

  return router;
}
