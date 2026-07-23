import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../lib/errors.js";
import { askDeepSeek } from "./ai.service.js";

describe("AI provider boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns validated provider content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "Validated response" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(askDeepSeek("system", "user")).resolves.toBe("Validated response");
  });

  it("maps invalid provider JSON to a safe gateway error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));

    await expect(askDeepSeek("system", "user")).rejects.toMatchObject<AppError>({
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

    await expect(askDeepSeek("system", "user")).rejects.toMatchObject<AppError>({
      statusCode: 502,
      code: "AI_PROVIDER_RESPONSE_TOO_LARGE",
    });
  });
});
