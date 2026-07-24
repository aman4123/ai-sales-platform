import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/errors.js";
import { askGroq } from "./ai.service.js";

describe("AI provider boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns validated provider content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "Validated response" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(askGroq("system", "user", { temperature: 0.8 })).resolves.toBe(
      "Validated response",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-provider-key" }),
      }),
    );
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_completion_tokens: 1_500,
      stream: false,
      temperature: 0.8,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
    });
  });

  it("maps invalid provider JSON to a safe gateway error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));

    await expect(askGroq("system", "user")).rejects.toMatchObject<AppError>({
      statusCode: 502,
      code: "AI_PROVIDER_RESPONSE_INVALID",
    });
  });

  it("rejects provider bodies over the configured limit before reading them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-length": "999999" },
        }),
      ),
    );

    await expect(askGroq("system", "user")).rejects.toMatchObject<AppError>({
      statusCode: 502,
      code: "AI_PROVIDER_RESPONSE_TOO_LARGE",
    });
  });
});
