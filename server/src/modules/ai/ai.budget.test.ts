import { describe, expect, it, vi } from "vitest";
import type { RedisClient } from "../../lib/redis.js";
import { consumeMonthlyAiRequest } from "./ai.routes.js";

function redisWithReplies(...replies: Array<number | string>) {
  const sendCommand = vi.fn();
  for (const reply of replies) sendCommand.mockResolvedValueOnce(reply);
  return {
    isOpen: true,
    connect: vi.fn(),
    quit: vi.fn(),
    ping: vi.fn(),
    sendCommand,
  } as unknown as RedisClient;
}

describe("monthly paid-AI budget guard", () => {
  it("atomically counts the first request and gives its key a bounded lifetime", async () => {
    const redis = redisWithReplies(1, 1);

    await consumeMonthlyAiRequest(redis, new Date("2026-07-24T00:00:00.000Z"));

    expect(redis.sendCommand).toHaveBeenNthCalledWith(1, ["INCR", "budget:ai:deepseek:2026-07"]);
    expect(redis.sendCommand).toHaveBeenNthCalledWith(
      2,
      ["EXPIREAT", "budget:ai:deepseek:2026-07", String(Date.UTC(2026, 8, 1) / 1_000)],
    );
  });

  it("rejects requests beyond the configured monthly limit", async () => {
    const redis = redisWithReplies(3);

    await expect(consumeMonthlyAiRequest(redis)).rejects.toMatchObject({
      statusCode: 429,
      code: "AI_MONTHLY_LIMIT_REACHED",
    });
  });

  it("keeps paid AI disabled without the distributed budget store", async () => {
    await expect(consumeMonthlyAiRequest(null)).rejects.toMatchObject({
      statusCode: 503,
      code: "AI_BUDGET_NOT_CONFIGURED",
    });
  });
});
