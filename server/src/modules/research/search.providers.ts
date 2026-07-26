import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { fetchPublicPage } from "./search.security.js";
import type {
  RetrievedPage,
  SearchOptions,
  SearchProvider,
  SearchProviderHealth,
  SearchProviderName,
  SearchResponse,
  SearchResult,
} from "./search.types.js";

const tavilySchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      content: z.string().optional().default(""),
    }),
  ),
});

const braveSchema = z.object({
  web: z
    .object({
      results: z.array(
        z.object({
          title: z.string(),
          url: z.string().url(),
          description: z.string().optional().default(""),
          age: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

const serperSchema = z.object({
  organic: z
    .array(
      z.object({
        title: z.string(),
        link: z.string().url(),
        snippet: z.string().optional().default(""),
        date: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

async function delay(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > env.SEARCH_RESPONSE_MAX_BYTES) {
    await response.body?.cancel();
    throw new AppError(502, "SEARCH_RESPONSE_TOO_LARGE", "The search provider response was too large.");
  }
  if (!response.body) {
    throw new AppError(502, "SEARCH_RESPONSE_INVALID", "The search provider returned no response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > env.SEARCH_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new AppError(502, "SEARCH_RESPONSE_TOO_LARGE", "The search provider response was too large.");
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AppError(502, "SEARCH_RESPONSE_INVALID", "The search provider response was invalid.");
  }
}

async function providerRequest(url: string, init: RequestInit): Promise<unknown> {
  for (let attempt = 0; attempt <= env.SEARCH_MAX_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(env.SEARCH_REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (attempt < env.SEARCH_MAX_RETRIES) {
        await delay(200 * 2 ** attempt);
        continue;
      }
      throw new AppError(502, "SEARCH_PROVIDER_UNAVAILABLE", "The search provider is unavailable.");
    }

    if (response.ok) return readJson(response);
    const retriable = response.status === 429 || response.status >= 500;
    await response.body?.cancel();
    if (retriable && attempt < env.SEARCH_MAX_RETRIES) {
      await delay(200 * 2 ** attempt);
      continue;
    }
    throw new AppError(502, "SEARCH_PROVIDER_ERROR", "The search provider rejected the request.");
  }

  throw new AppError(502, "SEARCH_PROVIDER_UNAVAILABLE", "The search provider is unavailable.");
}

abstract class BaseSearchProvider implements SearchProvider {
  abstract readonly name: SearchProviderName;
  abstract search(query: string, options: SearchOptions): Promise<SearchResponse>;

  async getPage(url: string): Promise<RetrievedPage> {
    return fetchPublicPage(url, {
      timeoutMs: env.SEARCH_REQUEST_TIMEOUT_MS,
      maximumBytes: env.SEARCH_RESPONSE_MAX_BYTES,
    });
  }

  async healthCheck(): Promise<SearchProviderHealth> {
    return { provider: this.name, configured: true, liveCheckPerformed: false };
  }

  protected response(query: string, results: SearchResult[]): SearchResponse {
    return {
      provider: this.name,
      query,
      results,
      retrievedAt: new Date().toISOString(),
    };
  }
}

class TavilySearchProvider extends BaseSearchProvider {
  readonly name = "TAVILY" as const;

  constructor(private readonly apiKey: string) {
    super();
  }

  async search(query: string, options: SearchOptions): Promise<SearchResponse> {
    const parsed = tavilySchema.safeParse(
      await providerRequest(env.TEST_TAVILY_API_URL ?? "https://api.tavily.com/search", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query,
          max_results: options.limit,
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false,
        }),
      }),
    );
    if (!parsed.success) {
      throw new AppError(502, "SEARCH_RESPONSE_INVALID", "The search provider response was invalid.");
    }
    return this.response(
      query,
      parsed.data.results.slice(0, options.limit).map((result) => ({
        title: result.title.trim(),
        url: result.url,
        snippet: result.content.trim(),
      })),
    );
  }
}

class BraveSearchProvider extends BaseSearchProvider {
  readonly name = "BRAVE" as const;

  constructor(private readonly apiKey: string) {
    super();
  }

  async search(query: string, options: SearchOptions): Promise<SearchResponse> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(options.limit));
    const parsed = braveSchema.safeParse(
      await providerRequest(url.toString(), {
        headers: {
          accept: "application/json",
          "x-subscription-token": this.apiKey,
        },
      }),
    );
    if (!parsed.success) {
      throw new AppError(502, "SEARCH_RESPONSE_INVALID", "The search provider response was invalid.");
    }
    return this.response(
      query,
      (parsed.data.web?.results ?? []).slice(0, options.limit).map((result) => ({
        title: result.title.trim(),
        url: result.url,
        snippet: result.description.trim(),
        ...(result.age ? { publishedAt: result.age } : {}),
      })),
    );
  }
}

class SerperSearchProvider extends BaseSearchProvider {
  readonly name = "SERPER" as const;

  constructor(private readonly apiKey: string) {
    super();
  }

  async search(query: string, options: SearchOptions): Promise<SearchResponse> {
    const parsed = serperSchema.safeParse(
      await providerRequest("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({ q: query, num: options.limit }),
      }),
    );
    if (!parsed.success) {
      throw new AppError(502, "SEARCH_RESPONSE_INVALID", "The search provider response was invalid.");
    }
    return this.response(
      query,
      parsed.data.organic.slice(0, options.limit).map((result) => ({
        title: result.title.trim(),
        url: result.link,
        snippet: result.snippet.trim(),
        ...(result.date ? { publishedAt: result.date } : {}),
      })),
    );
  }
}

export function createSearchProvider(): SearchProvider | null {
  if (!env.SEARCH_ENABLED) return null;
  if (env.SEARCH_PROVIDER === "TAVILY" && env.TAVILY_API_KEY) {
    return new TavilySearchProvider(env.TAVILY_API_KEY);
  }
  if (env.SEARCH_PROVIDER === "BRAVE" && env.BRAVE_SEARCH_API_KEY) {
    return new BraveSearchProvider(env.BRAVE_SEARCH_API_KEY);
  }
  if (env.SEARCH_PROVIDER === "SERPER" && env.SERPER_API_KEY) {
    return new SerperSearchProvider(env.SERPER_API_KEY);
  }
  return null;
}

export function searchProviderConfiguration() {
  const provider = createSearchProvider();
  return provider
    ? {
        enabled: true,
        provider: provider.name,
        configured: true,
        message: "Verified search is configured. Paid searches still require confirmation.",
      }
    : {
        enabled: false,
        provider: env.SEARCH_PROVIDER,
        configured: false,
        message: "Live search is not configured. Verified company research is unavailable.",
      };
}
