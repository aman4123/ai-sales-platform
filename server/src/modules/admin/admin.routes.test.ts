import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../lib/prisma.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { createAdminRouter } from "./admin.routes.js";

function appFor(accessMode: "TESTER" | "MASTER_ADMIN") {
  const transaction = {
    company: { upsert: vi.fn().mockResolvedValue({ id: "company-1", name: "Northstar Logistics (Demo)", industry: "Logistics" }) },
    contact: { upsert: vi.fn().mockResolvedValue({ id: "contact-1", name: "Jordan Lee (Demo)", publicEmail: "jordan@northstar.demo.invalid" }) },
    lead: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "lead-1" }) },
    deal: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "deal-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const database = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
  } as unknown as DatabaseClient;
  const app = express();
  app.use(express.json());
  app.use((incoming, _response, next) => {
    incoming.id = "request-1";
    incoming.user = {
      id: "master-1",
      email: "master@example.com",
      role: accessMode === "TESTER" ? "ADMIN" : "SUPER_ADMIN",
      accountRole: "SUPER_ADMIN",
      accessMode,
      sessionId: "session-1",
    };
    next();
  });
  app.use(createAdminRouter(database));
  app.use(errorHandler);
  return { app, transaction };
}

describe("Tester Mode demo workspace", () => {
  it("creates clearly labeled data only for the Master Admin owner", async () => {
    const { app, transaction } = appFor("TESTER");
    const response = await request(app).post("/demo-data");
    expect(response.status).toBe(201);
    expect(response.body.data.isolatedToUserId).toBe("master-1");
    expect(transaction.company.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_domain: { userId: "master-1", domain: "northstar-logistics.demo.invalid" } },
    }));
    expect(transaction.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "master-1", riskFlags: ["TEST_DATA", "NOT_VERIFIED"] }),
    });
  });

  it("rejects demo-data creation outside Tester Mode", async () => {
    const { app } = appFor("MASTER_ADMIN");
    expect((await request(app).post("/demo-data")).status).toBe(403);
  });
});
