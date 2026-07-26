import { describe, expect, it, vi } from "vitest";
import type { RedisClient } from "../../lib/redis.js";
import { consumeSearchBudget } from "./search.service.js";

describe("monthly search budget", () => {
  it("fails closed when Redis or a positive budget is unavailable", async () => {
    await expect(consumeSearchBudget(null, "TAVILY", new Date(), 10)).rejects.toMatchObject({ code: "SEARCH_BUDGET_NOT_CONFIGURED" });
    await expect(consumeSearchBudget({} as RedisClient, "TAVILY", new Date(), 0)).rejects.toMatchObject({ code: "SEARCH_BUDGET_NOT_CONFIGURED" });
  });

  it("sets an expiry on first use and rejects usage above the configured limit", async () => {
    const firstRedis = { sendCommand: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1) } as unknown as RedisClient;
    await expect(consumeSearchBudget(firstRedis, "TAVILY", new Date("2026-07-01T00:00:00Z"), 2)).resolves.toBeUndefined();
    expect(firstRedis.sendCommand).toHaveBeenCalledWith(["EXPIREAT", expect.any(String), expect.any(String)]);

    const exceededRedis = { sendCommand: vi.fn().mockResolvedValue(3) } as unknown as RedisClient;
    await expect(consumeSearchBudget(exceededRedis, "TAVILY", new Date(), 2)).rejects.toMatchObject({ code: "SEARCH_MONTHLY_LIMIT_REACHED" });
  });
});
