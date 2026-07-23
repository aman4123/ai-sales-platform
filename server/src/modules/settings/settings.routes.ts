import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  company: z.string().trim().max(160),
  signature: z.string().trim().max(5_000),
  aiProvider: z.enum(["MOCK", "DEEPSEEK"]),
  theme: z.enum(["DARK", "LIGHT", "SYSTEM"]),
  notifications: z.boolean(),
});

function serializeSettings(
  user: { id: string; name: string; email: string },
  settings: {
    company: string;
    signature: string;
    aiProvider: "MOCK" | "DEEPSEEK";
    theme: "DARK" | "LIGHT" | "SYSTEM";
    notifications: boolean;
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

    response.json({ data: { settings: serializeSettings(user, settings) } });
  });

  router.put("/", async (request, response) => {
    const input = updateSettingsSchema.parse(request.body);
    if (input.aiProvider === "DEEPSEEK" && !env.DEEPSEEK_API_KEY) {
      throw new AppError(
        409,
        "AI_PROVIDER_NOT_CONFIGURED",
        "DeepSeek cannot be selected until its API key is configured.",
      );
    }
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
        },
        update: {
          company: input.company,
          signature: input.signature,
          aiProvider: input.aiProvider,
          theme: input.theme,
          notifications: input.notifications,
        },
      });

      return serializeSettings(user, settings);
    });

    response.json({ data: { settings: result } });
  });

  return router;
}
