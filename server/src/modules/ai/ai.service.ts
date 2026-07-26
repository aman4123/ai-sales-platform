import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

const GROQ_CHAT_COMPLETIONS_URL = env.TEST_GROQ_API_URL ?? "https://api.groq.com/openai/v1/chat/completions";

const groqResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().trim().min(1) }),
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
  return `Verified information
Not verified.

Not verified
No source material was supplied for: ${prompt}

Recommended research steps
Live web search is required.

Sales opportunity summary
Not verified.`;
}

export function mockEmail(input: {
  company: string;
  contact: string;
  industry: string;
  tone: string;
  signature: string;
}): string {
  return `Subject:
A practical idea for ${input.company}

Greeting:
Hi ${input.contact},

Body:
I am reaching out regarding ${input.company} and the ${input.industry} industry. I would be glad to share a concise overview of an AI-assisted sales workflow if it is relevant to your team.

CTA:
Would a brief overview be useful?

Closing:
${input.signature || "Best regards,"}`;
}

export async function askGroq(
  systemPrompt: string,
  userPrompt: string,
  options: { temperature?: number } = {},
): Promise<string> {
  if (!env.GROQ_API_KEY) {
    throw new AppError(
      503,
      "AI_PROVIDER_NOT_CONFIGURED",
      "Groq is selected but GROQ_API_KEY is not configured.",
    );
  }

  let result: Response;
  try {
    result = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: options.temperature ?? 0.4,
        max_completion_tokens: env.AI_MAX_TOKENS,
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

  const payload = groqResponseSchema.safeParse(await readProviderPayload(result));
  if (!payload.success) {
    throw new AppError(502, "AI_PROVIDER_RESPONSE_INVALID", "The AI provider response was invalid.");
  }

  return payload.data.choices[0]!.message.content;
}
