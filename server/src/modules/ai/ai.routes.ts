import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { askDeepSeek, mockEmail, mockResearch } from "./ai.service.js";

const researchSchema = z.object({
  prompt: z.string().trim().min(3).max(4_000),
});

const emailSchema = z.object({
  company: z.string().trim().min(1).max(160),
  contact: z.string().trim().min(1).max(160),
  industry: z.string().trim().min(1).max(160),
  tone: z.enum(["Professional", "Friendly", "Sales", "Formal"]),
});

async function providerFor(database: DatabaseClient, userId: string) {
  const settings = await database.userSettings.findUnique({ where: { userId } });
  return settings ?? { aiProvider: "MOCK" as const, signature: "" };
}

async function persistActivity(
  database: DatabaseClient,
  activity: {
    userId: string;
    type: "RESEARCH" | "EMAIL";
    provider: "MOCK" | "DEEPSEEK";
    prompt: string;
    response: string;
  },
) {
  const retentionStart = new Date(Date.now() - env.AI_HISTORY_RETENTION_DAYS * 86_400_000);
  await database.$transaction(async (transaction) => {
    await transaction.aiRequest.deleteMany({
      where: { userId: activity.userId, createdAt: { lt: retentionStart } },
    });
    await transaction.aiRequest.create({ data: activity });
  });
}

export async function consumeMonthlyAiRequest(redis: RedisClient | null, now = new Date()) {
  if (env.AI_MONTHLY_REQUEST_LIMIT < 1 || !redis) {
    throw new AppError(
      503,
      "AI_BUDGET_NOT_CONFIGURED",
      "Paid AI is disabled until an administrator configures a monthly request budget.",
    );
  }

  const month = now.toISOString().slice(0, 7);
  const key = `budget:ai:deepseek:${month}`;
  const count = Number(await redis.sendCommand(["INCR", key]));
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new AppError(503, "AI_BUDGET_UNAVAILABLE", "The AI budget guard is unavailable.");
  }
  if (count === 1) {
    const expiresAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1) / 1_000;
    await redis.sendCommand(["EXPIREAT", key, String(expiresAt)]);
  }
  if (count > env.AI_MONTHLY_REQUEST_LIMIT) {
    throw new AppError(
      429,
      "AI_MONTHLY_LIMIT_REACHED",
      "The configured monthly AI request limit has been reached.",
    );
  }
}

export function createAiRouter(database: DatabaseClient, redis: RedisClient | null) {
  const router = Router();

  router.post("/research", async (request, response) => {
    const input = researchSchema.parse(request.body);
    const settings = await providerFor(database, request.user!.id);
    const result =
      settings.aiProvider === "DEEPSEEK"
        ? await (async () => {
            await consumeMonthlyAiRequest(redis);
            return askDeepSeek(
              "You are a careful B2B sales research analyst. Give factual, structured, concise research. Clearly label uncertainty and never invent private contact data.",
              input.prompt,
            );
          })()
        : mockResearch(input.prompt);

    await persistActivity(database, {
      userId: request.user!.id,
      type: "RESEARCH",
      provider: settings.aiProvider,
      prompt: input.prompt,
      response: result,
    });

    response.json({ data: { result, provider: settings.aiProvider } });
  });

  router.post("/email", async (request, response) => {
    const input = emailSchema.parse(request.body);
    const settings = await providerFor(database, request.user!.id);
    const prompt = `Write a ${input.tone.toLowerCase()} B2B sales email for ${input.contact} at ${input.company}, a company in ${input.industry}. Include a subject, greeting, concise value proposition, call to action, and closing.${settings.signature ? ` Use this signature: ${settings.signature}` : ""}`;
    const result =
      settings.aiProvider === "DEEPSEEK"
        ? await (async () => {
            await consumeMonthlyAiRequest(redis);
            return askDeepSeek(
              "You write concise, truthful B2B sales emails. Do not make unsupported claims or use manipulative language.",
              prompt,
            );
          })()
        : mockEmail({ ...input, signature: settings.signature });

    await persistActivity(database, {
      userId: request.user!.id,
      type: "EMAIL",
      provider: settings.aiProvider,
      prompt,
      response: result,
    });

    response.json({ data: { result, provider: settings.aiProvider } });
  });

  return router;
}

export function createDemoAiRouter() {
  const router = Router();

  router.post("/", (request, response) => {
    const input = researchSchema.parse(request.body);
    response.json({ data: { result: mockResearch(input.prompt), provider: "MOCK" } });
  });

  return router;
}
