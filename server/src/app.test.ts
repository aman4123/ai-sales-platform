import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { DatabaseClient } from "./lib/prisma.js";
import { signAccessToken } from "./modules/auth/auth.tokens.js";

const user = {
  id: "user-1",
  email: "sales@example.com",
  name: "Sales Admin",
  role: "ADMIN" as const,
  passwordHash: "$2b$04$Of1eA8z3f7J.KF72H8AQXOFx8SEAfH9/wyrDJlWjoIrfiKAdU3MuK",
  settings: {
    company: "Example Co",
    signature: "Sales Admin",
    aiProvider: "MOCK" as const,
    theme: "DARK" as const,
    notifications: true,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockDatabase() {
  const mock = {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    aiRequest: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };

  mock.$transaction.mockImplementation(async (operation: unknown) => {
    if (typeof operation === "function") {
      return (operation as (transaction: typeof mock) => unknown)(mock);
    }
    return operation;
  });
  mock.$queryRaw.mockResolvedValue([{ value: 1 }]);

  return { mock, database: mock as unknown as DatabaseClient };
}

function accessToken() {
  return signAccessToken({ id: user.id, email: user.email, role: user.role });
}

describe("production API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves liveness with security headers and a request ID", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false })).get(
      "/api/health/live",
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ok");
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("checks database readiness", async () => {
    const { database, mock } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false })).get(
      "/api/health/ready",
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ready");
    expect(mock.$queryRaw).toHaveBeenCalledOnce();
  });

  it("returns a consistent API not-found error", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false })).get("/api/missing");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.requestId).toBeTypeOf("string");
  });

  it("rejects untrusted browser origins", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false }))
      .get("/api/health/live")
      .set("origin", "https://malicious.example");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("protects CRM routes", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false })).get("/api/leads");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("issues a unique identifier with every access token", () => {
    expect(accessToken()).not.toBe(accessToken());
  });

  it("validates registration input", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/register")
      .send({ name: "A", email: "not-email", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("registers a user and sets an HTTP-only refresh cookie", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUnique.mockResolvedValue(null);
    mock.user.create.mockResolvedValue(user);
    mock.refreshSession.create.mockResolvedValue({});

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/register")
      .send({ name: user.name, email: user.email, password: "safe-password-123" });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe(user.email);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toBeTypeOf("string");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");
    expect(mock.refreshSession.create).toHaveBeenCalledOnce();
  });

  it("rejects invalid credentials without exposing account existence", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUnique.mockResolvedValue(null);

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/login")
      .send({ email: "missing@example.com", password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("The email address or password is incorrect.");
  });

  it("creates a database-backed lead for the authenticated user", async () => {
    const { database, mock } = createMockDatabase();
    const lead = {
      id: "lead-1",
      userId: user.id,
      company: "Acme",
      contact: "Alex",
      email: null,
      phone: null,
      industry: null,
      status: "INTERESTED" as const,
      value: { toString: () => "125000.00" },
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mock.lead.create.mockResolvedValue(lead);

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/leads")
      .set("authorization", `Bearer ${accessToken()}`)
      .send({ company: "Acme", contact: "Alex", status: "INTERESTED", value: 125000 });

    expect(response.status).toBe(201);
    expect(response.body.data.lead.value).toBe("125000.00");
    expect(mock.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: user.id }) }),
    );
  });

  it("keeps the landing AI demo public but validated", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/ai/demo")
      .send({ prompt: "Research logistics providers" });

    expect(response.status).toBe(200);
    expect(response.body.data.provider).toBe("MOCK");
    expect(response.body.data.result).toContain("Research logistics providers");
  });

  it("persists authenticated AI research activity", async () => {
    const { database, mock } = createMockDatabase();
    mock.userSettings.findUnique.mockResolvedValue(user.settings);
    mock.aiRequest.create.mockResolvedValue({});

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/ai/research")
      .set("authorization", `Bearer ${accessToken()}`)
      .send({ prompt: "Research manufacturing companies" });

    expect(response.status).toBe(200);
    expect(response.body.data.provider).toBe("MOCK");
    expect(mock.aiRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "RESEARCH" }) }),
    );
  });

  it("calculates reports from the current user's leads", async () => {
    const { database, mock } = createMockDatabase();
    mock.lead.findMany.mockResolvedValue([
      { status: "CLOSED", value: { toString: () => "50000" }, createdAt: new Date() },
      { status: "MEETING", value: { toString: () => "10000" }, createdAt: new Date() },
    ]);

    const response = await request(createApp({ database, serveStatic: false }))
      .get("/api/reports/summary")
      .set("authorization", `Bearer ${accessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toEqual({
      revenue: 50000,
      leads: 2,
      meetings: 1,
      closedDeals: 1,
    });
    expect(response.body.data.monthly.at(-1).leads).toBe(2);
  });
});
