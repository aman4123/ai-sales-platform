import { Router } from "express";
import { z } from "zod";
import type { DatabaseClient } from "../../lib/prisma.js";
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

export function createAiRouter(database: DatabaseClient) {
  const router = Router();

  router.post("/research", async (request, response) => {
    const input = researchSchema.parse(request.body);
    const settings = await providerFor(database, request.user!.id);
    const result =
      settings.aiProvider === "DEEPSEEK"
        ? await askDeepSeek(
            "You are a careful B2B sales research analyst. Give factual, structured, concise research. Clearly label uncertainty and never invent private contact data.",
            input.prompt,
          )
        : mockResearch(input.prompt);

    await database.aiRequest.create({
      data: {
        userId: request.user!.id,
        type: "RESEARCH",
        provider: settings.aiProvider,
        prompt: input.prompt,
        response: result,
      },
    });

    response.json({ data: { result, provider: settings.aiProvider } });
  });

  router.post("/email", async (request, response) => {
    const input = emailSchema.parse(request.body);
    const settings = await providerFor(database, request.user!.id);
    const prompt = `Write a ${input.tone.toLowerCase()} B2B sales email for ${input.contact} at ${input.company}, a company in ${input.industry}. Include a subject, greeting, concise value proposition, call to action, and closing.${settings.signature ? ` Use this signature: ${settings.signature}` : ""}`;
    const result =
      settings.aiProvider === "DEEPSEEK"
        ? await askDeepSeek(
            "You write concise, truthful B2B sales emails. Do not make unsupported claims or use manipulative language.",
            prompt,
          )
        : mockEmail({ ...input, signature: settings.signature });

    await database.aiRequest.create({
      data: {
        userId: request.user!.id,
        type: "EMAIL",
        provider: settings.aiProvider,
        prompt,
        response: result,
      },
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
