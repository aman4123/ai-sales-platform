import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../lib/prisma.js";
import type { RedisClient } from "../../lib/redis.js";
import { createAiRouter } from "./ai.routes.js";

function createDependencies() {
  const databaseMock = {
    userSettings: {
      findUnique: vi.fn().mockResolvedValue({
        aiProvider: "GROQ",
        signature: "Alex Morgan",
      }),
    },
    aiRequest: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };
  databaseMock.$transaction.mockImplementation(async (operation: unknown) =>
    (operation as (transaction: typeof databaseMock) => unknown)(databaseMock));

  const sendCommand = vi.fn().mockResolvedValue(1);
  const redis = { sendCommand } as unknown as RedisClient;

  return {
    database: databaseMock as unknown as DatabaseClient,
    databaseMock,
    redis,
    sendCommand,
  };
}

function createTestApp(database: DatabaseClient, redis: RedisClient) {
  const app = express();
  app.use(express.json());
  app.use((incoming, _response, next) => {
    incoming.user = { id: "user-1", email: "sales@example.com", role: "MEMBER" };
    next();
  });
  app.use(createAiRouter(database, redis));
  return app;
}

describe("Groq AI routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns and persists a real Groq research response", async () => {
    const { database, databaseMock, redis, sendCommand } = createDependencies();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Groq research response" } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(createTestApp(database, redis))
      .post("/research")
      .send({ prompt: "Research Acme's logistics market" });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ result: "Groq research response", provider: "GROQ" });
    expect(sendCommand).toHaveBeenCalledWith(["INCR", expect.stringMatching(/^budget:ai:groq:/)]);
    expect(databaseMock.aiRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: "GROQ", type: "RESEARCH" }),
    });
    const providerRequest = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(providerRequest.body as string)).toMatchObject({ temperature: 0.3 });
  });

  it("generates a varied Groq-powered sales email", async () => {
    const { database, databaseMock, redis } = createDependencies();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Subject: A distinct idea for Acme" } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(createTestApp(database, redis))
      .post("/email")
      .send({ company: "Acme", contact: "Sam", industry: "Logistics", tone: "Friendly" });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      result: "Subject: A distinct idea for Acme",
      provider: "GROQ",
    });
    expect(databaseMock.aiRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "GROQ",
        type: "EMAIL",
        prompt: expect.stringContaining("fresh, specific"),
      }),
    });
    const providerRequest = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(providerRequest.body as string)).toMatchObject({ temperature: 0.8 });
  });
});
