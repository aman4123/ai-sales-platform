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
