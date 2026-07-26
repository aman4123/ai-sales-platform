import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { createSearchProvider } from "./search.providers.js";
import type { SearchResponse } from "./search.types.js";

function searchCacheKey(provider: string, query: string, limit: number) {
  const digest = createHash("sha256")
    .update(`${provider}\0${query.trim().toLowerCase()}\0${limit}`)
    .digest("hex");
  return `cache:search:${digest}`;
}

export async function consumeSearchBudget(
  redis: RedisClient | null,
  provider: string,
  now = new Date(),
  monthlyLimit = env.SEARCH_MONTHLY_REQUEST_LIMIT,
) {
  if (monthlyLimit < 1 || !redis) {
    throw new AppError(
      503,
      "SEARCH_BUDGET_NOT_CONFIGURED",
      "Live search is disabled until an administrator configures a monthly search budget.",
    );
  }
  const month = now.toISOString().slice(0, 7);
  const key = `budget:search:${provider.toLowerCase()}:${month}`;
  const count = Number(await redis.sendCommand(["INCR", key]));
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new AppError(503, "SEARCH_BUDGET_UNAVAILABLE", "The search budget guard is unavailable.");
  }
  if (count === 1) {
    const expiresAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1) / 1_000;
    await redis.sendCommand(["EXPIREAT", key, String(expiresAt)]);
  }
  if (count > monthlyLimit) {
    throw new AppError(429, "SEARCH_MONTHLY_LIMIT_REACHED", "The monthly search limit has been reached.");
  }
}

function cachedResponse(value: unknown): SearchResponse | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as SearchResponse;
    return parsed && Array.isArray(parsed.results) && typeof parsed.query === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export async function executeVerifiedSearch(
  database: DatabaseClient,
  redis: RedisClient | null,
  userId: string,
  query: string,
): Promise<SearchResponse & { cached: boolean }> {
  const provider = createSearchProvider();
  if (!provider) {
    throw new AppError(
      503,
      "SEARCH_NOT_CONFIGURED",
      "Live search is not configured. Verified company research is unavailable.",
    );
  }

  const cacheKey = searchCacheKey(provider.name, query, env.SEARCH_RESULT_LIMIT);
  if (redis) {
    const cached = cachedResponse(await redis.sendCommand(["GET", cacheKey]));
    if (cached) return { ...cached, cached: true };
  }

  await consumeSearchBudget(redis, provider.name);
  const result = await provider.search(query, { limit: env.SEARCH_RESULT_LIMIT });
  const month = new Date().toISOString().slice(0, 7);
  await database.searchUsage.upsert({
    where: { userId_provider_month: { userId, provider: provider.name, month } },
    create: { userId, provider: provider.name, month, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (redis) {
    await redis.sendCommand([
      "SET",
      cacheKey,
      JSON.stringify(result),
      "EX",
      String(env.SEARCH_CACHE_TTL_SECONDS),
    ]);
  }
  return { ...result, cached: false };
}
