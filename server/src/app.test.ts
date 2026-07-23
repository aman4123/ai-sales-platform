import request from "supertest";
import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { DatabaseClient } from "./lib/prisma.js";
import { safeRequestPath } from "./lib/logger.js";
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
} from "./modules/auth/auth.tokens.js";

const user = {
  id: "user-1",
  email: "sales@example.com",
  emailVerifiedAt: new Date(),
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
      deleteMany: vi.fn(),
    },
    accountToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    recoveryCode: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    userSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    aiRequest: { create: vi.fn(), deleteMany: vi.fn() },
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

  it("returns a safe readiness failure when a dependency is unavailable", async () => {
    const { database, mock } = createMockDatabase();
    mock.$queryRaw.mockRejectedValue(new Error("database unavailable"));

    const response = await request(createApp({ database, serveStatic: false })).get(
      "/api/health/ready",
    );

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("NOT_READY");
    expect(response.body.error.requestId).toBeTypeOf("string");
  });

  it("protects Prometheus metrics with a bearer secret", async () => {
    const { database } = createMockDatabase();
    const app = createApp({ database, serveStatic: false });

    const denied = await request(app).get("/api/metrics");
    expect(denied.status).toBe(401);

    const response = await request(app)
      .get("/api/metrics")
      .set("authorization", "Bearer test-metrics-token-that-is-longer-than-thirty-two-characters");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("ai_sales_http_requests_total");
  });

  it("returns a consistent API not-found error", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false }))
      .get("/api/missing?token=must-not-be-reflected");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.requestId).toBeTypeOf("string");
    expect(response.body.error.message).not.toContain("must-not-be-reflected");
  });

  it("classifies malformed JSON as a client error", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/ai/demo")
      .set("content-type", "application/json")
      .send('{"prompt":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error.requestId).toBeTypeOf("string");
  });

  it("rejects request bodies over the configured limit", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/ai/demo")
      .send({ prompt: "x".repeat(110_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
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

  it("removes sensitive query strings from structured request logs", () => {
    expect(safeRequestPath("/reset-password?token=secret-value")).toBe("/reset-password");
    expect(safeRequestPath(undefined)).toBe("/");
  });

  it("validates registration input", async () => {
    const { database } = createMockDatabase();
    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/register")
      .send({ name: "A", email: "not-email", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("registers an unverified user without granting a session", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUnique.mockResolvedValue(null);
    mock.user.create.mockResolvedValue({ ...user, emailVerifiedAt: null });
    mock.accountToken.create.mockResolvedValue({ id: "verification-1" });
    const emailService = { sendVerification: vi.fn(), sendPasswordReset: vi.fn() };

    const response = await request(createApp({ database, emailService, serveStatic: false }))
      .post("/api/auth/register")
      .send({ name: user.name, email: user.email, password: "safe-password-123" });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe(user.email);
    expect(response.body.data.verificationRequired).toBe(true);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(emailService.sendVerification).toHaveBeenCalledOnce();
    expect(mock.refreshSession.create).not.toHaveBeenCalled();
  });

  it("does not reveal whether a registration email already belongs to an account", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUnique.mockResolvedValue(user);
    const emailService = { sendVerification: vi.fn(), sendPasswordReset: vi.fn() };

    const response = await request(createApp({ database, emailService, serveStatic: false }))
      .post("/api/auth/register")
      .send({ name: "Different Name", email: user.email, password: "safe-password-123" });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ email: user.email, verificationRequired: true });
    expect(mock.user.create).not.toHaveBeenCalled();
    expect(emailService.sendVerification).not.toHaveBeenCalled();
  });

  it("returns the same password-reset response for an unknown account", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUnique.mockResolvedValue(null);
    const emailService = { sendVerification: vi.fn(), sendPasswordReset: vi.fn() };

    const response = await request(createApp({ database, emailService, serveStatic: false }))
      .post("/api/auth/password-reset/request")
      .send({ email: "missing@example.com" });

    expect(response.status).toBe(202);
    expect(response.body.data.message).toContain("eligible account");
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("verifies email, creates one-time recovery codes, and starts a session", async () => {
    const { database, mock } = createMockDatabase();
    mock.accountToken.findUnique.mockResolvedValue({
      id: "verification-1",
      userId: user.id,
      type: "EMAIL_VERIFICATION",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...user, emailVerifiedAt: null },
    });
    mock.accountToken.updateMany.mockResolvedValue({ count: 1 });
    mock.user.update.mockResolvedValue(user);
    mock.refreshSession.create.mockResolvedValue({});

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/verify-email")
      .send({ token: "a".repeat(43) });

    expect(response.status).toBe(200);
    expect(response.body.data.user.emailVerified).toBe(true);
    expect(response.body.data.recoveryCodes).toHaveLength(8);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(mock.recoveryCode.createMany).toHaveBeenCalledOnce();
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

  it("logs in with valid credentials and creates a refresh session", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUnique.mockResolvedValue({
      ...user,
      passwordHash: await hash("safe-password-123", 4),
    });
    mock.refreshSession.create.mockResolvedValue({});

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/login")
      .send({ email: user.email, password: "safe-password-123" });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(user.email);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(mock.refreshSession.create).toHaveBeenCalledOnce();
  });

  it("does not grant a session before email verification", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUnique.mockResolvedValue({
      ...user,
      emailVerifiedAt: null,
      passwordHash: await hash("safe-password-123", 4),
    });

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/login")
      .send({ email: user.email, password: "safe-password-123" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(mock.refreshSession.create).not.toHaveBeenCalled();
  });

  it("consumes a password reset token and revokes active sessions", async () => {
    const { database, mock } = createMockDatabase();
    mock.accountToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: user.id,
      type: "PASSWORD_RESET",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mock.accountToken.updateMany.mockResolvedValue({ count: 1 });
    mock.refreshSession.updateMany.mockResolvedValue({ count: 2 });

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/password-reset/confirm")
      .send({ token: "b".repeat(43), password: "a-new-safe-password" });

    expect(response.status).toBe(204);
    expect(mock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passwordChangedAt: expect.any(Date) }) }),
    );
    expect(mock.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id, revokedAt: null } }),
    );
  });

  it("recovers an account with a single-use recovery code", async () => {
    const { database, mock } = createMockDatabase();
    const recoveryCode = "ABCDE-12345-ABCDE-12345";
    mock.user.findUnique.mockResolvedValue({
      ...user,
      recoveryCodes: [{ id: "recovery-1", codeHash: hashToken("ABCDE12345ABCDE12345") }],
    });
    mock.recoveryCode.updateMany.mockResolvedValue({ count: 1 });
    mock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/recover")
      .send({ email: user.email, recoveryCode, password: "another-safe-password" });

    expect(response.status).toBe(204);
    expect(mock.recoveryCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ usedAt: null }) }),
    );
    expect(mock.accountToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id, type: "PASSWORD_RESET" },
    });
  });

  it("rotates a valid refresh session", async () => {
    const { database, mock } = createMockDatabase();
    const refreshToken = signRefreshToken(user.id, "session-1");
    mock.refreshSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });
    mock.refreshSession.updateMany.mockResolvedValue({ count: 1 });
    mock.refreshSession.create.mockResolvedValue({});

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/refresh")
      .set("cookie", `refresh_token=${refreshToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeTypeOf("string");
    expect(response.headers["set-cookie"]?.[0]).toContain("refresh_token=");
    expect(mock.refreshSession.create).toHaveBeenCalledOnce();
  });

  it("revokes all active sessions when a refresh token is replayed", async () => {
    const { database, mock } = createMockDatabase();
    const refreshToken = signRefreshToken(user.id, "session-replayed");
    mock.refreshSession.findUnique.mockResolvedValue({
      id: "session-replayed",
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user,
    });
    mock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/refresh")
      .set("cookie", `refresh_token=${refreshToken}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.message).toContain("reuse");
    expect(mock.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id, revokedAt: null } }),
    );
  });

  it("logs out idempotently and clears the refresh cookie", async () => {
    const { database, mock } = createMockDatabase();
    const refreshToken = signRefreshToken(user.id, "session-logout");
    mock.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/auth/logout")
      .set("cookie", `refresh_token=${refreshToken}`)
      .send({});

    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]?.[0]).toContain("refresh_token=;");
    expect(mock.refreshSession.updateMany).toHaveBeenCalledOnce();
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

  it("paginates lead lists and never queries another user's records", async () => {
    const { database, mock } = createMockDatabase();
    const leads = ["lead-3", "lead-2", "lead-1"].map((id) => ({
      id,
      userId: user.id,
      company: "Acme",
      contact: "Alex",
      email: null,
      phone: null,
      industry: null,
      status: "INTERESTED" as const,
      value: { toString: () => "100.00" },
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mock.lead.findMany.mockResolvedValue(leads);
    mock.lead.count.mockResolvedValue(3);

    const response = await request(createApp({ database, serveStatic: false }))
      .get("/api/leads?limit=2")
      .set("authorization", `Bearer ${accessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.leads).toHaveLength(2);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.nextCursor).toBe("lead-2");
    expect(mock.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: user.id }), take: 3 }),
    );
  });

  it("maps an unauthorized lead update to not found", async () => {
    const { database, mock } = createMockDatabase();
    mock.lead.update.mockRejectedValue({ code: "P2025" });

    const response = await request(createApp({ database, serveStatic: false }))
      .put("/api/leads/another-users-lead")
      .set("authorization", `Bearer ${accessToken()}`)
      .send({ company: "No access" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(mock.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "another-users-lead", userId: user.id } }),
    );
  });

  it("returns and updates database-backed settings", async () => {
    const { database, mock } = createMockDatabase();
    mock.user.findUniqueOrThrow.mockResolvedValue(user);
    mock.user.findUnique.mockResolvedValue(user);
    mock.user.update.mockResolvedValue(user);
    mock.userSettings.upsert.mockResolvedValue(user.settings);

    const getResponse = await request(createApp({ database, serveStatic: false }))
      .get("/api/settings")
      .set("authorization", `Bearer ${accessToken()}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.settings.company).toBe(user.settings.company);

    const updateResponse = await request(createApp({ database, serveStatic: false }))
      .put("/api/settings")
      .set("authorization", `Bearer ${accessToken()}`)
      .send({
        name: user.name,
        email: user.email,
        company: "Updated Co",
        signature: "Regards",
        aiProvider: "MOCK",
        theme: "SYSTEM",
        notifications: false,
      });
    expect(updateResponse.status).toBe(200);
    expect(mock.userSettings.upsert).toHaveBeenCalledOnce();
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

  it("generates and persists an authenticated sales email", async () => {
    const { database, mock } = createMockDatabase();
    mock.userSettings.findUnique.mockResolvedValue(user.settings);
    mock.aiRequest.create.mockResolvedValue({});

    const response = await request(createApp({ database, serveStatic: false }))
      .post("/api/ai/email")
      .set("authorization", `Bearer ${accessToken()}`)
      .send({ company: "Acme", contact: "Alex", industry: "Logistics", tone: "Professional" });

    expect(response.status).toBe(200);
    expect(response.body.data.result).toContain("Subject:");
    expect(mock.aiRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "EMAIL" }) }),
    );
  });

  it("calculates reports from the current user's leads", async () => {
    const { database, mock } = createMockDatabase();
    mock.lead.groupBy.mockResolvedValue([
      { status: "CLOSED", _count: { _all: 1 }, _sum: { value: { toString: () => "50000" } } },
      { status: "MEETING", _count: { _all: 1 }, _sum: { value: { toString: () => "10000" } } },
    ]);
    const now = new Date();
    mock.$queryRaw.mockResolvedValue([
      { month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), leads: 2 },
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
