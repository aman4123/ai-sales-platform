import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === "true";
const suffix = randomUUID();
const firstEmail = `integration-a-${suffix}@example.com`;
const secondEmail = `integration-b-${suffix}@example.com`;
const app = createApp({ database: prisma, serveStatic: false });

describe.runIf(runDatabaseTests)("PostgreSQL API integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [firstEmail, secondEmail] } } });
    await prisma.$disconnect();
  });

  it("enforces tenant isolation and rotating refresh sessions against the migrated schema", async () => {
    const firstRegistration = await request(app).post("/api/auth/register").send({
      name: "Integration One",
      email: firstEmail,
      password: "integration-password-123",
    });
    expect(firstRegistration.status).toBe(201);
    expect(firstRegistration.body.data.user.role).toBe("MEMBER");
    const firstAccessToken = firstRegistration.body.data.accessToken as string;
    const firstCookie = firstRegistration.headers["set-cookie"]?.[0] as string;

    const created = await request(app)
      .post("/api/leads")
      .set("authorization", `Bearer ${firstAccessToken}`)
      .send({ company: "Tenant One", contact: "Owner", status: "INTERESTED", value: 1250 });
    expect(created.status).toBe(201);
    const leadId = created.body.data.lead.id as string;

    const secondRegistration = await request(app).post("/api/auth/register").send({
      name: "Integration Two",
      email: secondEmail,
      password: "integration-password-456",
    });
    expect(secondRegistration.status).toBe(201);
    const secondAccessToken = secondRegistration.body.data.accessToken as string;

    const isolatedList = await request(app)
      .get("/api/leads")
      .set("authorization", `Bearer ${secondAccessToken}`);
    expect(isolatedList.status).toBe(200);
    expect(isolatedList.body.data.total).toBe(0);

    const forbiddenUpdate = await request(app)
      .put(`/api/leads/${leadId}`)
      .set("authorization", `Bearer ${secondAccessToken}`)
      .send({ company: "Attempted takeover" });
    expect(forbiddenUpdate.status).toBe(404);

    const rotated = await request(app)
      .post("/api/auth/refresh")
      .set("cookie", firstCookie)
      .send({});
    expect(rotated.status).toBe(200);
    const rotatedCookie = rotated.headers["set-cookie"]?.[0] as string;

    const replayed = await request(app)
      .post("/api/auth/refresh")
      .set("cookie", firstCookie)
      .send({});
    expect(replayed.status).toBe(401);
    expect(replayed.body.error.message).toContain("reuse");

    const revokedRotation = await request(app)
      .post("/api/auth/refresh")
      .set("cookie", rotatedCookie)
      .send({});
    expect(revokedRotation.status).toBe(401);
  });
});
