import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { createSearchProvider, searchProviderConfiguration } from "./search.providers.js";
import { executeVerifiedSearch } from "./search.service.js";

const original = {
  enabled: env.SEARCH_ENABLED,
  provider: env.SEARCH_PROVIDER,
  tavily: env.TAVILY_API_KEY,
  brave: env.BRAVE_SEARCH_API_KEY,
  serper: env.SERPER_API_KEY,
  retries: env.SEARCH_MAX_RETRIES,
  limit: env.SEARCH_MONTHLY_REQUEST_LIMIT,
};

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

describe("search provider adapters", () => {
  beforeEach(() => {
    env.SEARCH_ENABLED = true;
    env.TAVILY_API_KEY = "tavily-test-key";
    env.BRAVE_SEARCH_API_KEY = "brave-test-key";
    env.SERPER_API_KEY = "serper-test-key";
    env.SEARCH_MAX_RETRIES = 0;
    env.SEARCH_MONTHLY_REQUEST_LIMIT = 5;
  });
  afterEach(() => {
    env.SEARCH_ENABLED = original.enabled;
    env.SEARCH_PROVIDER = original.provider;
    env.TAVILY_API_KEY = original.tavily;
    env.BRAVE_SEARCH_API_KEY = original.brave;
    env.SERPER_API_KEY = original.serper;
    env.SEARCH_MAX_RETRIES = original.retries;
    env.SEARCH_MONTHLY_REQUEST_LIMIT = original.limit;
    vi.unstubAllGlobals();
  });

  it.each([
    ["TAVILY", { results: [{ title: "Example", url: "https://example.com", content: "Public description" }] }],
    ["BRAVE", { web: { results: [{ title: "Example", url: "https://example.com", description: "Public description", age: "today" }] } }],
    ["SERPER", { organic: [{ title: "Example", link: "https://example.com", snippet: "Public description", date: "today" }] }],
  ] as const)("normalizes %s responses behind one interface", async (providerName, payload) => {
    env.SEARCH_PROVIDER = providerName;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));
    const provider = createSearchProvider();
    expect(provider?.name).toBe(providerName);
    await expect(provider!.search("logistics", { limit: 3 })).resolves.toMatchObject({
      provider: providerName,
      query: "logistics",
      results: [{ title: "Example", url: "https://example.com", snippet: "Public description" }],
    });
    await expect(provider!.healthCheck()).resolves.toEqual({ provider: providerName, configured: true, liveCheckPerformed: false });
  });

  it("retrieves bounded public text through the shared SSRF guard", async () => {
    env.SEARCH_PROVIDER = "TAVILY";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<h1>Public page</h1>", { status: 200, headers: { "content-type": "text/html" } })));
    const page = await createSearchProvider()!.getPage("https://93.184.216.34");
    expect(page.content).toBe("Public page");
  });

  it("maps provider failures and invalid responses to generic errors", async () => {
    env.SEARCH_PROVIDER = "TAVILY";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("denied", { status: 401 })));
    await expect(createSearchProvider()!.search("query", { limit: 1 })).rejects.toMatchObject({ code: "SEARCH_PROVIDER_ERROR" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ unexpected: true })));
    await expect(createSearchProvider()!.search("query", { limit: 1 })).rejects.toMatchObject({ code: "SEARCH_RESPONSE_INVALID" });
  });

  it("reports a safe disabled state and never exposes provider keys", () => {
    env.SEARCH_ENABLED = false;
    expect(createSearchProvider()).toBeNull();
    expect(searchProviderConfiguration()).toEqual({
      enabled: false,
      provider: env.SEARCH_PROVIDER,
      configured: false,
      requiredEnvironmentVariable: "TAVILY_API_KEY",
      message: "TAVILY live search is disabled. Configure TAVILY_API_KEY, enable SEARCH_ENABLED, and set a positive SEARCH_MONTHLY_REQUEST_LIMIT.",
    });
    expect(JSON.stringify(searchProviderConfiguration())).not.toContain("test-key");
  });

  it("uses cache before budget and records uncached provider usage", async () => {
    env.SEARCH_PROVIDER = "TAVILY";
    const cached = { provider: "TAVILY", query: "cached", results: [], retrievedAt: new Date().toISOString() };
    const cachedRedis = { sendCommand: vi.fn().mockResolvedValueOnce(JSON.stringify(cached)) } as unknown as RedisClient;
    const database = { searchUsage: { upsert: vi.fn() } } as unknown as DatabaseClient;
    await expect(executeVerifiedSearch(database, cachedRedis, "user-1", "cached", "tenant-1")).resolves.toMatchObject({ cached: true });
    expect(database.searchUsage.upsert).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    const redis = { sendCommand: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce("OK") } as unknown as RedisClient;
    vi.mocked(database.searchUsage.upsert).mockResolvedValue({} as never);
    await expect(executeVerifiedSearch(database, redis, "user-1", "fresh", "tenant-1")).resolves.toMatchObject({ cached: false });
    expect(database.searchUsage.upsert).toHaveBeenCalled();
    expect(redis.sendCommand).toHaveBeenLastCalledWith(["SET", expect.any(String), expect.any(String), "EX", expect.any(String)]);
  });
});
