import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import { clearCookieOptions, REFRESH_COOKIE } from "../auth/auth.security.js";
import { searchProviderConfiguration } from "../research/search.providers.js";

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  company: z.string().trim().max(160),
  signature: z.string().trim().max(5_000),
  aiProvider: z.enum(["MOCK", "GROQ"]),
  theme: z.enum(["DARK", "LIGHT", "SYSTEM"]),
  notifications: z.boolean(),
  organization: z.string().trim().max(160).optional(),
  timezone: z
    .string()
    .trim()
    .max(80)
    .refine((value) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Use a valid IANA timezone.")
    .optional(),
  language: z.enum(["en"]).optional(),
  dataRetentionDays: z.number().int().min(30).max(3_650).optional(),
  campaignDailyLimit: z.number().int().min(1).max(1_000).optional(),
  unsubscribeFooter: z.string().trim().max(1_000).optional(),
  senderName: z.string().trim().max(120).optional(),
  senderEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.literal("")]).optional(),
  privacyMode: z.enum(["STANDARD", "MINIMAL_RETENTION"]).optional(),
});
const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
  email: z.string().trim().toLowerCase().email().max(254),
});
const shortList = z.array(z.string().trim().min(1).max(500)).max(100).default([]);
const profileSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  website: z.union([z.string().trim().url().max(2_000), z.literal("")]).default(""),
  industry: z.string().trim().max(160).default(""),
  description: z.string().trim().max(5_000).default(""),
  products: shortList,
  services: shortList,
  useCases: shortList,
  pricingSummary: z.string().trim().max(2_000).default(""),
  targetIndustries: shortList,
  targetCompanySizes: shortList,
  targetJobTitles: shortList,
  targetLocations: shortList,
  exclusions: shortList,
  valuePropositions: shortList,
  competitors: shortList,
  caseStudies: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
    sourceUrl: z.string().trim().url().max(2_000).optional(),
  })).max(50).default([]),
  testimonials: z.array(z.object({
    quote: z.string().trim().min(1).max(2_000),
    attribution: z.string().trim().max(200).default(""),
    sourceUrl: z.string().trim().url().max(2_000).optional(),
  })).max(50).default([]),
  faqs: z.array(z.object({
    question: z.string().trim().min(1).max(500),
    answer: z.string().trim().min(1).max(3_000),
  })).max(100).default([]),
  commonObjections: z.array(z.object({
    objection: z.string().trim().min(1).max(500),
    approvedResponse: z.string().trim().min(1).max(3_000),
  })).max(100).default([]),
  knowledgeSources: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    url: z.string().trim().url().max(2_000),
    type: z.enum(["WEBSITE", "DOCUMENT", "CASE_STUDY", "FAQ", "OTHER"]),
  })).max(100).default([]),
  preferredTone: z.enum(["Professional", "Friendly", "Formal", "Concise", "Consultative"]),
  complianceRequirements: shortList,
  contactDetails: z.object({
    email: z.union([z.string().trim().email().max(254), z.literal("")]).default(""),
    phone: z.string().trim().max(80).default(""),
    address: z.string().trim().max(500).default(""),
  }),
  meetingPreferences: z.object({
    timezone: z.string().trim().max(80).default("UTC"),
    schedulingUrl: z.union([z.string().trim().url().max(2_000), z.literal("")]).default(""),
    assignedCloser: z.string().trim().max(160).default(""),
  }),
});

function requireProfileEditor(request: { tenant?: { role: string } }) {
  if (!request.tenant || !["TENANT_ADMIN", "SALES_MANAGER"].includes(request.tenant.role)) {
    throw new AppError(
      403,
      "COMPANY_PROFILE_EDIT_FORBIDDEN",
      "Tenant Admin or Sales Manager access is required to edit company knowledge.",
    );
  }
}

function serializeSettings(
  user: { id: string; name: string; email: string },
  settings: {
    company: string;
    signature: string;
    aiProvider: "MOCK" | "GROQ";
    theme: "DARK" | "LIGHT" | "SYSTEM";
    notifications: boolean;
    organization: string;
    timezone: string;
    language: string;
    dataRetentionDays: number;
    campaignDailyLimit: number;
    unsubscribeFooter: string;
    senderName: string;
    senderEmail: string;
    privacyMode: string;
  },
) {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    ...settings,
  };
}

export function createSettingsRouter(database: DatabaseClient) {
  const router = Router();

  router.get("/", async (request, response) => {
    const user = await database.user.findUniqueOrThrow({
      where: { id: request.user!.id },
      include: { settings: true },
    });
    const settings =
      user.settings ??
      (await database.userSettings.upsert({
        where: { userId: request.user!.id },
        create: { userId: request.user!.id },
        update: {},
      }));

    response.json({
      data: {
        settings: serializeSettings(user, settings),
        providerStatus: {
          research: searchProviderConfiguration(),
          email: {
            configured: env.EMAIL_DELIVERY_MODE !== "log",
            provider: env.EMAIL_DELIVERY_MODE,
            outboundEnabled: env.OUTBOUND_EMAIL_ENABLED,
            deliveryMode: env.OUTBOUND_DELIVERY_MODE,
          },
        },
      },
    });
  });

  router.put("/", async (request, response) => {
    const input = updateSettingsSchema.parse(request.body);
    const currentUser = await database.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    if (input.email !== currentUser.email) {
      throw new AppError(
        409,
        "EMAIL_CHANGE_REQUIRES_VERIFICATION",
        "Email changes require a separately verified account workflow.",
      );
    }

    const result = await database.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: request.user!.id },
        data: { name: input.name },
      });
      const settings = await transaction.userSettings.upsert({
        where: { userId: request.user!.id },
        create: {
          userId: request.user!.id,
          company: input.company,
          signature: input.signature,
          aiProvider: input.aiProvider,
          theme: input.theme,
          notifications: input.notifications,
          ...(input.organization !== undefined ? { organization: input.organization } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.language !== undefined ? { language: input.language } : {}),
          ...(input.dataRetentionDays !== undefined
            ? { dataRetentionDays: input.dataRetentionDays }
            : {}),
          ...(input.campaignDailyLimit !== undefined
            ? { campaignDailyLimit: input.campaignDailyLimit }
            : {}),
          ...(input.unsubscribeFooter !== undefined
            ? { unsubscribeFooter: input.unsubscribeFooter }
            : {}),
          ...(input.senderName !== undefined ? { senderName: input.senderName } : {}),
          ...(input.senderEmail !== undefined ? { senderEmail: input.senderEmail } : {}),
          ...(input.privacyMode !== undefined ? { privacyMode: input.privacyMode } : {}),
        },
        update: {
          company: input.company,
          signature: input.signature,
          aiProvider: input.aiProvider,
          theme: input.theme,
          notifications: input.notifications,
          ...(input.organization !== undefined ? { organization: input.organization } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.language !== undefined ? { language: input.language } : {}),
          ...(input.dataRetentionDays !== undefined
            ? { dataRetentionDays: input.dataRetentionDays }
            : {}),
          ...(input.campaignDailyLimit !== undefined
            ? { campaignDailyLimit: input.campaignDailyLimit }
            : {}),
          ...(input.unsubscribeFooter !== undefined
            ? { unsubscribeFooter: input.unsubscribeFooter }
            : {}),
          ...(input.senderName !== undefined ? { senderName: input.senderName } : {}),
          ...(input.senderEmail !== undefined ? { senderEmail: input.senderEmail } : {}),
          ...(input.privacyMode !== undefined ? { privacyMode: input.privacyMode } : {}),
        },
      });

      return serializeSettings(user, settings);
    });

    response.json({ data: { settings: result } });
  });

  router.get("/company-profile", async (request, response) => {
    if (!request.tenant) {
      throw new AppError(409, "TENANT_CONTEXT_REQUIRED", "A company workspace is required.");
    }
    const profile = await database.companyProfile.findUnique({
      where: { tenantId: request.tenant.id },
    });
    response.json({
      data: {
        profile: profile ?? {
          tenantId: request.tenant.id,
          status: "DRAFT",
          version: 0,
          companyName: "",
          website: "",
          industry: "",
          description: "",
          products: [],
          services: [],
          useCases: [],
          pricingSummary: "",
          targetIndustries: [],
          targetCompanySizes: [],
          targetJobTitles: [],
          targetLocations: [],
          exclusions: [],
          valuePropositions: [],
          competitors: [],
          caseStudies: [],
          testimonials: [],
          faqs: [],
          commonObjections: [],
          knowledgeSources: [],
          preferredTone: "Professional",
          complianceRequirements: [],
          contactDetails: { email: "", phone: "", address: "" },
          meetingPreferences: { timezone: "UTC", schedulingUrl: "", assignedCloser: "" },
          approvedAt: null,
          updatedAt: null,
        },
      },
    });
  });

  router.put("/company-profile", async (request, response) => {
    requireProfileEditor(request);
    const input = profileSchema.parse(request.body);
    const tenantId = request.tenant!.id;
    const data = {
      companyName: input.companyName,
      website: input.website || null,
      industry: input.industry || null,
      description: input.description || null,
      products: input.products,
      services: input.services,
      useCases: input.useCases,
      pricingSummary: input.pricingSummary || null,
      targetIndustries: input.targetIndustries,
      targetCompanySizes: input.targetCompanySizes,
      targetJobTitles: input.targetJobTitles,
      targetLocations: input.targetLocations,
      exclusions: input.exclusions,
      valuePropositions: input.valuePropositions,
      competitors: input.competitors,
      caseStudies: input.caseStudies,
      testimonials: input.testimonials,
      faqs: input.faqs,
      commonObjections: input.commonObjections,
      knowledgeSources: input.knowledgeSources,
      preferredTone: input.preferredTone,
      complianceRequirements: input.complianceRequirements,
      contactDetails: input.contactDetails,
      meetingPreferences: input.meetingPreferences,
      status: "DRAFT" as const,
      approvedAt: null,
      approvedById: null,
    };
    const profile = await database.companyProfile.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: { ...data, version: { increment: 1 } },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId,
        action: "COMPANY_PROFILE_UPDATED",
        resourceType: "CompanyProfile",
        resourceId: profile.id,
        requestId: request.id,
        metadata: { version: profile.version, status: profile.status },
      },
    });
    response.json({ data: { profile } });
  });

  router.post("/company-profile/approve", async (request, response) => {
    requireProfileEditor(request);
    z.object({ confirm: z.literal(true) }).parse(request.body);
    const tenantId = request.tenant!.id;
    const existing = await database.companyProfile.findUnique({ where: { tenantId } });
    if (
      !existing
      || !existing.companyName
      || existing.products.length + existing.services.length === 0
      || existing.valuePropositions.length === 0
    ) {
      throw new AppError(
        422,
        "COMPANY_PROFILE_INCOMPLETE",
        "Add a company name, at least one product or service, and a value proposition before approval.",
      );
    }
    const profile = await database.companyProfile.update({
      where: { tenantId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedById: request.user!.id,
      },
    });
    await database.auditLog.create({
      data: {
        actorUserId: request.user!.id,
        tenantId,
        action: "COMPANY_PROFILE_APPROVED",
        resourceType: "CompanyProfile",
        resourceId: profile.id,
        requestId: request.id,
        metadata: { version: profile.version },
      },
    });
    response.json({ data: { profile } });
  });

  router.delete("/account", async (request, response) => {
    const input = deleteAccountSchema.parse(request.body);
    const user = await database.user.findUnique({
      where: { id: request.user!.id },
      select: { id: true, email: true },
    });
    if (!user || user.email !== input.email) {
      throw new AppError(409, "ACCOUNT_CONFIRMATION_MISMATCH", "Account deletion confirmation did not match.");
    }
    await database.$transaction([
      database.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "ACCOUNT_DELETED_BY_USER",
          resourceType: "User",
          resourceId: user.id,
          requestId: request.id,
        },
      }),
      database.user.delete({ where: { id: user.id } }),
    ]);
    response.clearCookie(REFRESH_COOKIE, clearCookieOptions);
    response.status(204).send();
  });

  return router;
}
