import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createResearchRouter } from "./research.routes.js";

function appFor(database: DatabaseClient, redis: RedisClient | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.id = "request-1";
    req.user = { id: "user-1", email: "user@example.com", role: "USER" };
    next();
  });
  app.use(createResearchRouter(database, redis));
  app.use(errorHandler);
  return app;
}

function fixture() {
  const job = { id: "job-1", userId: "user-1", query: "logistics India", targetType: "COMPANY", status: "RUNNING", provider: "TAVILY", error: null, createdAt: new Date() };
  const result = { id: "result-1", userId: "user-1", jobId: "job-1", companyId: null, companyName: "Example Logistics", legalName: null, aliases: [], website: "https://example.com", domain: "example.com", industry: null, description: null, headquarters: null, operatingLocations: [], publicPhone: null, publicEmail: null, socialProfiles: null, registrationIdentifiers: null, productsServices: [], unknownFields: [], confidenceScore: 60, riskFlags: ["REQUIRES_CONFIRMATION"], salesAnalysis: null, staleAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
  const database = {
    researchJob: {
      findMany: vi.fn().mockResolvedValue([job]),
      findFirst: vi.fn().mockResolvedValue({ ...job, results: [result] }),
      create: vi.fn().mockResolvedValue(job),
      update: vi.fn(async ({ data }) => ({ ...job, ...data })),
    },
    companyResearchResult: {
      create: vi.fn(async ({ data }) => ({ id: "result-created", ...data, evidence: data.evidence.create })),
      findFirst: vi.fn().mockResolvedValue(result),
      update: vi.fn().mockResolvedValue({ ...result, companyId: "company-1" }),
    },
    userSettings: { findUnique: vi.fn().mockResolvedValue({ aiProvider: "MOCK" }) },
    searchUsage: { upsert: vi.fn().mockResolvedValue({ id: "usage-1" }) },
    company: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ id: "company-1", ...data })),
    },
  } as unknown as DatabaseClient;
  const redis = { sendCommand: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce("OK") } as unknown as RedisClient;
  return { database, redis, job, result };
}

const original = {
  enabled: env.SEARCH_ENABLED,
  provider: env.SEARCH_PROVIDER,
  key: env.TAVILY_API_KEY,
  budget: env.SEARCH_MONTHLY_REQUEST_LIMIT,
  retries: env.SEARCH_MAX_RETRIES,
};

describe("research routes", () => {
  beforeEach(() => {
    env.SEARCH_ENABLED = false;
    env.SEARCH_PROVIDER = "TAVILY";
    env.TAVILY_API_KEY = undefined;
    env.SEARCH_MONTHLY_REQUEST_LIMIT = 0;
    env.SEARCH_MAX_RETRIES = 0;
  });
  afterEach(() => {
    env.SEARCH_ENABLED = original.enabled;
    env.SEARCH_PROVIDER = original.provider;
    env.TAVILY_API_KEY = original.key;
    env.SEARCH_MONTHLY_REQUEST_LIMIT = original.budget;
    env.SEARCH_MAX_RETRIES = original.retries;
    vi.unstubAllGlobals();
  });

  it("returns disabled status and rejects unconfirmed or unavailable paid search", async () => {
    const { database, redis } = fixture();
    const app = appFor(database, redis);
    const status = await request(app).get("/status");
    expect(status.body.data.message).toBe("Live search is not configured. Verified company research is unavailable.");
    expect((await request(app).post("/jobs").send({ query: "logistics India", targetType: "COMPANY" })).status).toBe(409);
    expect((await request(app).post("/jobs").send({ query: "logistics India", targetType: "COMPANY", confirmPaidSearch: true })).status).toBe(503);
  });

  it("lists and reads only owned structured jobs", async () => {
    const { database, redis } = fixture();
    const app = appFor(database, redis);
    expect((await request(app).get("/jobs?limit=10")).body.data.jobs).toHaveLength(1);
    expect((await request(app).get("/jobs/job-1")).body.data.job.id).toBe("job-1");
    vi.mocked(database.researchJob.findFirst).mockResolvedValueOnce(null);
    expect((await request(app).get("/jobs/other-job")).status).toBe(404);
  });

  it("runs retrieval before AI and persists only structured source evidence", async () => {
    env.SEARCH_ENABLED = true;
    env.TAVILY_API_KEY = "tavily-test-key";
    env.SEARCH_MONTHLY_REQUEST_LIMIT = 5;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "Example Logistics", url: "https://example.com", content: "Public logistics company profile" }] }), { status: 200, headers: { "content-type": "application/json" } })));
    const { database, redis } = fixture();
    const response = await request(appFor(database, redis)).post("/jobs").send({ query: "logistics India", targetType: "COMPANY", confirmPaidSearch: true });
    expect(response.status).toBe(201);
    expect(response.body.data.job.status).toBe("COMPLETED");
    expect(response.body.data.job.results[0]).toMatchObject({ companyName: "Example Logistics", domain: "example.com" });
    expect(database.companyResearchResult.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ evidence: { create: expect.any(Array) }, riskFlags: expect.arrayContaining(["REQUIRES_CONFIRMATION"]) }) }));
  });

  it("stores safe failure state without raw stack traces", async () => {
    env.SEARCH_ENABLED = true;
    env.TAVILY_API_KEY = "tavily-test-key";
    env.SEARCH_MONTHLY_REQUEST_LIMIT = 5;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret stack and provider token")));
    const { database, redis } = fixture();
    const response = await request(appFor(database, redis)).post("/jobs").send({ query: "logistics India", confirmPaidSearch: true });
    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).not.toMatch(/secret stack|provider token/i);
    expect(database.researchJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ error: "The search provider is unavailable." }) }));
  });

  it("saves new research companies and reuses domain duplicates", async () => {
    const { database, redis } = fixture();
    const app = appFor(database, redis);
    const created = await request(app).post("/results/result-1/save");
    expect(created.status).toBe(201);
    expect(created.body.data.duplicate).toBe(false);
    vi.mocked(database.company.findUnique).mockResolvedValueOnce({ id: "company-existing", domain: "example.com" } as never);
    const duplicate = await request(app).post("/results/result-1/save");
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.duplicate).toBe(true);
  });
});
