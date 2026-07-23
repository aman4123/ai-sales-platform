import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { runRetention } from "./jobs/retention.js";

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === "true";
const suffix = randomUUID();
const firstEmail = `integration-a-${suffix}@example.com`;
const secondEmail = `integration-b-${suffix}@example.com`;
const app = createApp({ database: prisma, serveStatic: false });

async function registerVerified(name: string, email: string, password: string) {
  const registration = await request(app).post("/api/auth/register").send({ name, email, password });
  expect(registration.status).toBe(201);
  expect(registration.body.data.accessToken).toBeUndefined();
  const verification = await request(app).post("/api/auth/verify-email").send({
    token: registration.body.data.developmentVerificationToken,
  });
  expect(verification.status).toBe(200);
  expect(verification.body.data.user.emailVerified).toBe(true);
  expect(verification.body.data.recoveryCodes).toHaveLength(8);
  return verification;
}

describe.runIf(runDatabaseTests)("PostgreSQL API integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [firstEmail, secondEmail] } } });
    await prisma.$disconnect();
  });

  it("enforces account lifecycle, tenant isolation, and rotating sessions against PostgreSQL", async () => {
    const firstRegistration = await registerVerified(
      "Integration One",
      firstEmail,
      "integration-password-123",
    );
    expect(firstRegistration.body.data.user.role).toBe("MEMBER");
    const firstAccessToken = firstRegistration.body.data.accessToken as string;
    const firstCookie = firstRegistration.headers["set-cookie"]?.[0] as string;
    const recoveryCode = firstRegistration.body.data.recoveryCodes[0] as string;

    const created = await request(app)
      .post("/api/leads")
      .set("authorization", `Bearer ${firstAccessToken}`)
      .send({ company: "Tenant One", contact: "Owner", status: "INTERESTED", value: 1250 });
    expect(created.status).toBe(201);
    const leadId = created.body.data.lead.id as string;

    const secondRegistration = await registerVerified(
      "Integration Two",
      secondEmail,
      "integration-password-456",
    );
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

    const resetRequest = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ email: firstEmail });
    expect(resetRequest.status).toBe(202);
    const pendingResetToken = resetRequest.body.data.developmentResetToken as string;

    const recovered = await request(app).post("/api/auth/recover").send({
      email: firstEmail,
      recoveryCode,
      password: "integration-recovered-password",
    });
    expect(recovered.status).toBe(204);

    const staleReset = await request(app).post("/api/auth/password-reset/confirm").send({
      token: pendingResetToken,
      password: "integration-reset-token-should-fail",
    });
    expect(staleReset.status).toBe(400);
    expect(staleReset.body.error.code).toBe("RESET_TOKEN_INVALID");

    const recoveredLogin = await request(app).post("/api/auth/login").send({
      email: firstEmail,
      password: "integration-recovered-password",
    });
    expect(recoveredLogin.status).toBe(200);

    const reusedRecoveryCode = await request(app).post("/api/auth/recover").send({
      email: firstEmail,
      recoveryCode,
      password: "integration-reused-password",
    });
    expect(reusedRecoveryCode.status).toBe(401);
  });

  it("runs retention under a PostgreSQL advisory transaction lock", async () => {
    await expect(runRetention(prisma)).resolves.toEqual({
      sessions: expect.any(Number),
      accountTokens: expect.any(Number),
      aiRequests: expect.any(Number),
    });
  });
});
