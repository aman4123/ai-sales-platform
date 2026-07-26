import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../lib/prisma.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createSettingsRouter } from "./settings.routes.js";

function appFor(database: DatabaseClient) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.id = "request-1";
    req.user = { id: "user-1", email: "user@example.com", role: "USER" };
    next();
  });
  app.use(createSettingsRouter(database));
  app.use(errorHandler);
  return app;
}

const settings = {
  userId: "user-1",
  company: "Example",
  signature: "Sam",
  aiProvider: "GROQ",
  theme: "DARK",
  notifications: true,
  organization: "Example Org",
  timezone: "UTC",
  language: "en",
  dataRetentionDays: 90,
  campaignDailyLimit: 25,
  unsubscribeFooter: "Reply unsubscribe to opt out.",
  senderName: "Sam",
  senderEmail: "sam@example.com",
  privacyMode: "STANDARD",
};

function fixture(existingSettings: typeof settings | null = settings) {
  const transaction = {
    user: {
      update: vi.fn().mockResolvedValue({ id: "user-1", name: "Updated", email: "user@example.com" }),
      delete: vi.fn().mockResolvedValue({ id: "user-1" }),
    },
    userSettings: { upsert: vi.fn().mockResolvedValue(settings) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const database = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "user-1", name: "User", email: "user@example.com", settings: existingSettings }),
      findUnique: vi.fn().mockResolvedValue({ id: "user-1", email: "user@example.com" }),
      delete: transaction.user.delete,
    },
    userSettings: { upsert: vi.fn().mockResolvedValue(settings) },
    auditLog: transaction.auditLog,
    $transaction: vi.fn(async (operation) => typeof operation === "function" ? operation(transaction) : Promise.all(operation)),
  } as unknown as DatabaseClient;
  return { database, transaction };
}

const payload = {
  name: "Updated",
  email: "user@example.com",
  company: "Example",
  signature: "Sam",
  aiProvider: "GROQ",
  theme: "DARK",
  notifications: true,
  organization: "Example Org",
  timezone: "Asia/Kolkata",
  language: "en",
  dataRetentionDays: 60,
  campaignDailyLimit: 20,
  unsubscribeFooter: "Reply unsubscribe to opt out.",
  senderName: "Sam",
  senderEmail: "sam@example.com",
  privacyMode: "MINIMAL_RETENTION",
};

describe("V2 settings routes", () => {
  it("returns provider status without secrets and creates missing settings", async () => {
    const existing = fixture();
    const response = await request(appFor(existing.database)).get("/");
    expect(response.body.data.settings.organization).toBe("Example Org");
    expect(response.body.data.providerStatus).not.toHaveProperty("apiKey");

    const missing = fixture(null);
    expect((await request(appFor(missing.database)).get("/")).status).toBe(200);
    expect(missing.database.userSettings.upsert).toHaveBeenCalled();
  });

  it("updates all V2 preferences but rejects an unverified email change", async () => {
    const { database, transaction } = fixture();
    expect((await request(appFor(database)).put("/").send(payload)).status).toBe(200);
    expect(transaction.userSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ dataRetentionDays: 60, campaignDailyLimit: 20, privacyMode: "MINIMAL_RETENTION" }) }));
    expect((await request(appFor(database)).put("/").send({ ...payload, email: "other@example.com" })).status).toBe(409);
  });

  it("requires exact account confirmation and deletes owned records through cascades", async () => {
    const { database } = fixture();
    const app = appFor(database);
    expect((await request(app).delete("/account").send({ confirm: "DELETE", email: "other@example.com" })).status).toBe(409);
    const response = await request(app).delete("/account").send({ confirm: "DELETE", email: "user@example.com" });
    expect(response.status).toBe(204);
    expect(database.auditLog.create).toHaveBeenCalled();
    expect(database.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(response.headers["set-cookie"]?.join(";")).toMatch(/refresh_token=/);
  });
});
