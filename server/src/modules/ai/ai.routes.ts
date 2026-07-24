import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { askGroq, mockEmail, mockResearch } from "./ai.service.js";

type AiProvider = "MOCK" | "GROQ";

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
    provider: AiProvider;
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
  const key = `budget:ai:groq:${month}`;
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

export function resolveAiProvider(
  configuredProvider: AiProvider,
  apiKey: string | undefined = env.GROQ_API_KEY,
): AiProvider {
  return configuredProvider === "GROQ" && apiKey?.trim() ? "GROQ" : "MOCK";
}

export function createAiRouter(database: DatabaseClient, redis: RedisClient | null) {
  const router = Router();

  router.post("/research", async (request, response) => {
    const input = researchSchema.parse(request.body);
    const settings = await providerFor(database, request.user!.id);
    const provider = resolveAiProvider(settings.aiProvider);
    const result =
      provider === "GROQ"
        ? await (async () => {
            await consumeMonthlyAiRequest(redis);
            return askGroq(
              "You are a careful B2B sales research analyst. Give factual, structured, concise research. Clearly label uncertainty and never invent private contact data.",
              input.prompt,
              { temperature: 0.3 },
            );
          })()
        : mockResearch(input.prompt);

    await persistActivity(database, {
      userId: request.user!.id,
      type: "RESEARCH",
      provider,
      prompt: input.prompt,
      response: result,
    });

    response.json({ data: { result, provider } });
  });

  router.post("/email", async (request, response) => {
    const input = emailSchema.parse(request.body);
    const settings = await providerFor(database, request.user!.id);
    const provider = resolveAiProvider(settings.aiProvider);
    const prompt = `Write a fresh, specific ${input.tone.toLowerCase()} B2B sales email for ${input.contact} at ${input.company}, a company in ${input.industry}. Create an original subject line and wording for this request. Include a greeting, concise relevant value proposition, low-friction call to action, and closing. Avoid clichés, fabricated facts, and placeholders.${settings.signature ? ` Use this exact signature: ${settings.signature}` : ""}`;
    const result =
      provider === "GROQ"
        ? await (async () => {
            await consumeMonthlyAiRequest(redis);
            return askGroq(
              "You write concise, truthful, personalized B2B sales emails. Produce a distinct variation for every request. Do not make unsupported claims or use manipulative language.",
              prompt,
              { temperature: 0.8 },
            );
          })()
        : mockEmail({ ...input, signature: settings.signature });

    await persistActivity(database, {
      userId: request.user!.id,
      type: "EMAIL",
      provider,
      prompt,
      response: result,
    });

    response.json({ data: { result, provider } });
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
