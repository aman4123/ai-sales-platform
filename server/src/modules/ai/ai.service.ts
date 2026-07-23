import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

const deepSeekResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().min(1) }),
    }),
  ).min(1),
});

async function readProviderPayload(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > env.AI_RESPONSE_MAX_BYTES) {
    await response.body?.cancel();
    throw new AppError(502, "AI_PROVIDER_RESPONSE_TOO_LARGE", "The AI provider response was too large.");
  }

  if (!response.body) {
    throw new AppError(502, "AI_PROVIDER_RESPONSE_INVALID", "The AI provider returned no response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > env.AI_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new AppError(
        502,
        "AI_PROVIDER_RESPONSE_TOO_LARGE",
        "The AI provider response was too large.",
      );
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AppError(502, "AI_PROVIDER_RESPONSE_INVALID", "The AI provider response was invalid.");
  }
}

export function mockResearch(prompt: string): string {
  return `AI Sales Analysis

Prompt:
${prompt}

Company: Example Technologies Pvt Ltd

Industry:
Software Development

Employees:
250+

Pain Points:
• Low outbound response rate
• Manual lead research
• No CRM automation

Recommendations:
• Use LinkedIn outreach
• Automate follow-up emails
• Integrate CRM with AI
• Score leads automatically

Confidence Score:
94%`;
}

export function mockEmail(input: {
  company: string;
  contact: string;
  industry: string;
  tone: string;
  signature: string;
}): string {
  return `Subject: Helping ${input.company} accelerate sales in ${input.industry}

Hi ${input.contact},

I noticed ${input.company}'s work in ${input.industry} and wanted to reach out. Our AI Sales Platform helps teams research prospects, personalize outreach, and manage their pipeline from one place.

Would you be open to a 15-minute conversation next week to see whether this could support your goals?

Best regards${input.signature ? `,\n${input.signature}` : ""}`;
}

export async function askDeepSeek(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new AppError(
      503,
      "AI_PROVIDER_NOT_CONFIGURED",
      "DeepSeek is selected but DEEPSEEK_API_KEY is not configured.",
    );
  }

  let result: Response;
  try {
    result = await fetch(`${env.DEEPSEEK_API_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: env.AI_MAX_TOKENS,
        stream: false,
      }),
      signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The AI provider timed out."
      : "The AI provider could not be reached.";
    throw new AppError(502, "AI_PROVIDER_UNAVAILABLE", message);
  }

  if (!result.ok) {
    await result.body?.cancel();
    throw new AppError(502, "AI_PROVIDER_ERROR", "The AI provider rejected the request.");
  }

  const payload = deepSeekResponseSchema.safeParse(await readProviderPayload(result));
  if (!payload.success) {
    throw new AppError(502, "AI_PROVIDER_RESPONSE_INVALID", "The AI provider response was invalid.");
  }

  return payload.data.choices[0]!.message.content;
}
