import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import { createClient } from "redis";
import { API_ORIGIN, E2E_PASSWORD, apiRequest, responseError, signedWebhook, uniqueEmail } from "./helpers.js";

test.describe.configure({ mode: "serial" });

async function registerApi(request: APIRequestContext, email: string, verify = true) {
  const registration = await request.post(`${API_ORIGIN}/auth/register`, {
    data: { name: "Failure Path User", email, password: E2E_PASSWORD },
  });
  expect(registration.status(), await registration.text()).toBe(201);
  const registrationPayload = await registration.json() as {
    data: { developmentVerificationToken?: string };
  };
  if (!verify) return { token: null, verificationToken: registrationPayload.data.developmentVerificationToken };
  expect(registrationPayload.data.developmentVerificationToken).toBeTruthy();
  const verification = await request.post(`${API_ORIGIN}/auth/verify-email`, {
    data: { token: registrationPayload.data.developmentVerificationToken },
  });
  expect(verification.status(), await verification.text()).toBe(200);
  const verificationPayload = await verification.json() as { data: { accessToken: string } };
  return { token: verificationPayload.data.accessToken, verificationToken: registrationPayload.data.developmentVerificationToken };
}

async function configureUser(request: APIRequestContext, token: string, dailyLimit = 25) {
  const current = await apiRequest<{ data: { settings: {
    name: string;
    email: string;
    company: string;
    signature: string;
    aiProvider: "MOCK" | "GROQ";
    theme: "DARK" | "LIGHT" | "SYSTEM";
    notifications: boolean;
  } } }>(request, token, "GET", "/settings");
  await apiRequest(request, token, "PUT", "/settings", {
    name: current.data.settings.name,
    email: current.data.settings.email,
    company: current.data.settings.company,
    aiProvider: "GROQ",
    theme: current.data.settings.theme,
    notifications: current.data.settings.notifications,
    senderName: "Failure Path Sender",
    senderEmail: "e2e-sender@example.test",
    signature: "Regards,\nFailure Path Sender",
    unsubscribeFooter: "Reply unsubscribe to stop future messages.",
    campaignDailyLimit: dailyLimit,
  });
}

async function groundedContact(request: APIRequestContext, token: string, suffix: string) {
  const research = await apiRequest<{
    data: { job: { results: Array<{ id: string }> } };
  }>(request, token, "POST", "/research/jobs", {
    query: `Northstar Logistics ${suffix}`,
    targetType: "COMPANY",
    confirmPaidSearch: true,
  }, 201);
  const resultId = research.data.job.results[0]?.id;
  expect(resultId).toBeTruthy();
  const saved = await apiRequest<{ data: { company: { id: string } } }>(request, token, "POST", `/research/results/${resultId}/save`, undefined, 201);
  const contact = await apiRequest<{ data: { contact: { id: string } } }>(request, token, "POST", "/crm/contacts", {
    companyId: saved.data.company.id,
    name: `Casey ${suffix}`,
    jobTitle: "Operations Director",
    publicEmail: "recipient@example.test",
    publicSourceUrl: "https://northstar-logistics.example/team",
    verificationStatus: "PARTIALLY_VERIFIED",
  }, 201);
  return { companyId: saved.data.company.id, contactId: contact.data.contact.id };
}

function campaignInput(name: string, salesGoal = "Start a reviewed conversation") {
  return {
    name,
    salesGoal,
    productService: "Human-approved sales workflow",
    valueProposition: "Keeps evidence, approval, and delivery controls visible",
    audienceFilters: {},
    senderIdentity: { displayName: "Failure Path Sender", email: "e2e-sender@example.test" },
    tone: "Professional",
    sequenceConfig: { followUps: [] },
    schedule: { timezone: "UTC", weekdays: [1, 2, 3, 4, 5], windowStart: "09:00", windowEnd: "17:00" },
    dailySendingLimit: 25,
  };
}

async function createDraftCampaign(request: APIRequestContext, token: string, contactId: string, name: string, salesGoal?: string) {
  const created = await apiRequest<{ data: { campaign: { id: string } } }>(request, token, "POST", "/campaigns", campaignInput(name, salesGoal), 201);
  const campaignId = created.data.campaign.id;
  await apiRequest(request, token, "POST", `/campaigns/${campaignId}/recipients`, { leadIds: [], contactIds: [contactId] }, 201);
  const drafts = await apiRequest<{ data: { created: number } }>(request, token, "POST", `/campaigns/${campaignId}/drafts`, { confirm: true }, 201);
  expect(drafts.data.created).toBe(1);
  return campaignId;
}

async function campaignDetail(request: APIRequestContext, token: string, campaignId: string) {
  return (await apiRequest<{ data: { campaign: {
    id: string;
    status: string;
    contentVersion: number;
    approvedVersion: number | null;
    messages: Array<{
      id: string;
      status: string;
      subject: string;
      greeting: string;
      body: string;
      cta: string;
      closing: string;
      attemptCount: number;
      failureReason: string | null;
    }>;
    recipients: Array<{ id: string; status: string }>;
    approvals: unknown[];
  } } }>(request, token, "GET", `/campaigns/${campaignId}`)).data.campaign;
}

async function approveAndQueue(request: APIRequestContext, token: string, campaignId: string) {
  await apiRequest(request, token, "POST", `/campaigns/${campaignId}/approve`, { approved: true, approvalType: "INITIAL_ONLY" }, 201);
  return apiRequest<{ data: { queued: number; suppressed: number } }>(request, token, "POST", `/campaigns/${campaignId}/queue`, { confirm: true });
}

async function mailpitCount(request: APIRequestContext) {
  const response = await request.get("http://127.0.0.1:58025/api/v1/messages");
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = await response.json() as { total?: number; messages?: unknown[] };
  return payload.total ?? payload.messages?.length ?? 0;
}

test("fails closed for unverified login, expired reset tokens, and cross-tenant access", async ({ request }) => {
  const unverifiedEmail = uniqueEmail("unverified", test.info().project.name);
  await registerApi(request, unverifiedEmail, false);
  const unverifiedLogin = await request.post(`${API_ORIGIN}/auth/login`, {
    data: { email: unverifiedEmail, password: E2E_PASSWORD },
  });
  expect(unverifiedLogin.status()).toBe(403);
  expect((await responseError(unverifiedLogin)).error.code).toBe("EMAIL_NOT_VERIFIED");

  const firstEmail = uniqueEmail("tenant-a", test.info().project.name);
  const first = await registerApi(request, firstEmail);
  const firstToken = first.token!;
  const reset = await request.post(`${API_ORIGIN}/auth/password-reset/request`, { data: { email: firstEmail } });
  expect(reset.status()).toBe(202);
  const resetPayload = await reset.json() as { data: { developmentResetToken: string } };
  const resetHash = createHash("sha256").update(resetPayload.data.developmentResetToken).digest("hex");
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl || !/(test|ci)/i.test(new URL(databaseUrl).pathname)) throw new Error("An isolated E2E database is required.");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('UPDATE "AccountToken" SET "expiresAt" = NOW() - INTERVAL \'1 minute\' WHERE "tokenHash" = $1', [resetHash]);
  } finally {
    await pool.end();
  }
  const expiredReset = await request.post(`${API_ORIGIN}/auth/password-reset/confirm`, {
    data: { token: resetPayload.data.developmentResetToken, password: "replacement-password" },
  });
  expect(expiredReset.status()).toBe(400);
  expect((await responseError(expiredReset)).error.code).toBe("RESET_TOKEN_INVALID");
  const oldPasswordStillWorks = await request.post(`${API_ORIGIN}/auth/login`, {
    data: { email: firstEmail, password: E2E_PASSWORD },
  });
  expect(oldPasswordStillWorks.status()).toBe(200);

  const ownedCompany = await apiRequest<{ data: { company: { id: string } } }>(request, firstToken, "POST", "/crm/companies", {
    name: "Tenant A Company",
    website: "https://tenant-a.example",
  }, 201);
  const ownedCampaign = await apiRequest<{ data: { campaign: { id: string } } }>(request, firstToken, "POST", "/campaigns", campaignInput("Tenant A Campaign"), 201);

  const secondEmail = uniqueEmail("tenant-b", test.info().project.name);
  const secondToken = (await registerApi(request, secondEmail)).token!;
  const foreignCampaign = await request.get(`${API_ORIGIN}/campaigns/${ownedCampaign.data.campaign.id}`, {
    headers: { authorization: `Bearer ${secondToken}` },
  });
  expect(foreignCampaign.status()).toBe(404);
  const foreignContact = await request.post(`${API_ORIGIN}/crm/contacts`, {
    headers: { authorization: `Bearer ${secondToken}` },
    data: { companyId: ownedCompany.data.company.id, name: "Cross Tenant", verificationStatus: "UNVERIFIED" },
  });
  expect(foreignContact.status()).toBe(404);
  const foreignApproval = await request.post(`${API_ORIGIN}/campaigns/${ownedCampaign.data.campaign.id}/approve`, {
    headers: { authorization: `Bearer ${secondToken}` },
    data: { approved: true, approvalType: "INITIAL_ONLY" },
  });
  expect(foreignApproval.status()).toBe(404);
  const foreignQueue = await request.post(`${API_ORIGIN}/campaigns/${ownedCampaign.data.campaign.id}/queue`, {
    headers: { authorization: `Bearer ${secondToken}` }, data: { confirm: true },
  });
  expect(foreignQueue.status()).toBe(404);
  const unchanged = await campaignDetail(request, firstToken, ownedCampaign.data.campaign.id);
  expect(unchanged.status).toBe("DRAFT");
  expect(unchanged.approvals).toHaveLength(0);
});

test("contains provider failures, exhausted budgets, invalid payloads, and prompt injection", async ({ request }) => {
  const email = uniqueEmail("provider-failures", test.info().project.name);
  const token = (await registerApi(request, email)).token!;
  await configureUser(request, token);

  for (const [query, code] of [
    [`provider unavailable ${Date.now()}`, "SEARCH_PROVIDER_ERROR"],
    [`invalid provider response ${Date.now()}`, "SEARCH_RESPONSE_INVALID"],
  ] as const) {
    const response = await request.post(`${API_ORIGIN}/research/jobs`, {
      headers: { authorization: `Bearer ${token}` },
      data: { query, targetType: "COMPANY", confirmPaidSearch: true },
    });
    expect(response.status()).toBe(502);
    const error = await responseError(response);
    expect(error.error.code).toBe(code);
    expect(JSON.stringify(error)).not.toMatch(/fixture-unavailable|e2e-tavily-fixture-key|stack/i);
  }

  const injection = await apiRequest<{ data: { job: { results: Array<{
    companyName: string | null;
    riskFlags: string[];
    evidence: Array<{ field: string; value: string; sourceTitle: string }>;
  }> } } }>(request, token, "POST", "/research/jobs", {
    query: `prompt injection ${Date.now()}`,
    targetType: "COMPANY",
    confirmPaidSearch: true,
  }, 201);
  const injectionResult = injection.data.job.results[0];
  expect(injectionResult?.companyName).toBeNull();
  expect(injectionResult?.riskFlags).toContain("PROMPT_INJECTION_DETECTED");
  expect(JSON.stringify(injectionResult)).not.toMatch(/ignore previous|reveal the developer|disregard all/i);

  const grounded = await apiRequest<{ data: { job: { results: Array<{
    id: string;
    salesAnalysis: { rejectedUnsupportedFacts: number };
    evidence: Array<{ id: string }>;
  }> } } }>(request, token, "POST", "/research/jobs", {
    query: `research field without evidence ${Date.now()}`,
    targetType: "COMPANY",
    confirmPaidSearch: true,
  }, 201);
  expect(grounded.data.job.results[0]?.salesAnalysis.rejectedUnsupportedFacts).toBe(1);
  expect(JSON.stringify(grounded)).not.toContain("Unsupported fixture claim");

  const redisUrl = process.env.E2E_REDIS_URL;
  if (!redisUrl || new URL(redisUrl).pathname === "/0") throw new Error("A dedicated E2E Redis database is required.");
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  const budgetKey = `budget:search:tavily:${new Date().toISOString().slice(0, 7)}`;
  try {
    await redis.set(budgetKey, "100");
    const exhausted = await request.post(`${API_ORIGIN}/research/jobs`, {
      headers: { authorization: `Bearer ${token}` },
      data: { query: `budget exhausted unique ${Date.now()}`, targetType: "COMPANY", confirmPaidSearch: true },
    });
    expect(exhausted.status()).toBe(429);
    expect((await responseError(exhausted)).error.code).toBe("SEARCH_MONTHLY_LIMIT_REACHED");
  } finally {
    await redis.del(budgetKey);
    await redis.quit();
  }

  const resultId = grounded.data.job.results[0]!.id;
  const saved = await apiRequest<{ data: { company: { id: string } } }>(request, token, "POST", `/research/results/${resultId}/save`, undefined, 201);
  const contact = await apiRequest<{ data: { contact: { id: string } } }>(request, token, "POST", "/crm/contacts", {
    companyId: saved.data.company.id,
    name: "Groq Failure Contact",
    publicEmail: "recipient@example.test",
    publicSourceUrl: "https://northstar-logistics.example/team",
    verificationStatus: "PARTIALLY_VERIFIED",
  }, 201);
  const groqCampaign = await apiRequest<{ data: { campaign: { id: string } } }>(request, token, "POST", "/campaigns", campaignInput("Groq failure campaign", "groq unavailable"), 201);
  await apiRequest(request, token, "POST", `/campaigns/${groqCampaign.data.campaign.id}/recipients`, { leadIds: [], contactIds: [contact.data.contact.id] }, 201);
  const groqUnavailable = await request.post(`${API_ORIGIN}/campaigns/${groqCampaign.data.campaign.id}/drafts`, {
    headers: { authorization: `Bearer ${token}` }, data: { confirm: true },
  });
  expect(groqUnavailable.status()).toBe(502);
  const groqError = await responseError(groqUnavailable);
  expect(JSON.stringify(groqError)).not.toMatch(/fixture-unavailable|e2e-groq-fixture-key|stack/i);
  expect((await campaignDetail(request, token, groqCampaign.data.campaign.id)).messages).toHaveLength(0);
});

test("keeps approval, delivery, webhook, bounce, complaint, retry, and suppression state safe", async ({ request }) => {
  const suffix = `campaign-${Date.now()}`;
  const email = uniqueEmail("campaign-failures", test.info().project.name);
  const token = (await registerApi(request, email)).token!;
  await configureUser(request, token, 1);
  const { contactId } = await groundedContact(request, token, suffix);
  const mailBefore = await mailpitCount(request);

  const campaignId = await createDraftCampaign(request, token, contactId, `Failure campaign ${suffix}`);
  const beforeApprovalSend = await request.post(`${API_ORIGIN}/campaigns/${campaignId}/send-approved`, {
    headers: { authorization: `Bearer ${token}` }, data: { confirm: true },
  });
  expect(beforeApprovalSend.status()).toBe(409);
  expect(await mailpitCount(request)).toBe(mailBefore);
  let detail = await campaignDetail(request, token, campaignId);
  expect(detail.status).toBe("READY_FOR_REVIEW");

  await apiRequest(request, token, "POST", `/campaigns/${campaignId}/approve`, { approved: true, approvalType: "INITIAL_ONLY" }, 201);
  const approvedVersion = (await campaignDetail(request, token, campaignId)).contentVersion;
  const originalMessage = (await campaignDetail(request, token, campaignId)).messages[0]!;
  await apiRequest(request, token, "PUT", `/campaigns/messages/${originalMessage.id}`, {
    subject: "Reviewed subject",
    greeting: originalMessage.greeting,
    body: originalMessage.body,
    cta: originalMessage.cta,
    closing: originalMessage.closing,
  });
  detail = await campaignDetail(request, token, campaignId);
  expect(detail.contentVersion).toBeGreaterThan(approvedVersion);
  expect(detail.approvedVersion).toBeNull();
  const staleQueue = await request.post(`${API_ORIGIN}/campaigns/${campaignId}/queue`, {
    headers: { authorization: `Bearer ${token}` }, data: { confirm: true },
  });
  expect(staleQueue.status()).toBe(409);
  expect(detail.messages.some((message) => message.status === "QUEUED")).toBe(false);

  const headerInjection = await request.put(`${API_ORIGIN}/campaigns/messages/${originalMessage.id}`, {
    headers: { authorization: `Bearer ${token}` },
    data: { subject: "Safe\r\nBcc: attacker@example.test", greeting: originalMessage.greeting, body: originalMessage.body, cta: originalMessage.cta, closing: originalMessage.closing },
  });
  expect(headerInjection.status()).toBe(400);
  expect((await campaignDetail(request, token, campaignId)).messages[0]?.subject).toBe("Reviewed subject");

  await apiRequest(request, token, "PUT", `/campaigns/messages/${originalMessage.id}`, {
    subject: "Simulated provider failure",
    greeting: originalMessage.greeting,
    body: originalMessage.body,
    cta: originalMessage.cta,
    closing: originalMessage.closing,
  });
  await approveAndQueue(request, token, campaignId);
  const queued = await campaignDetail(request, token, campaignId);
  const queuedMessage = queued.messages[0]!;
  const invalidWebhook = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook({
    providerEventId: `invalid-${suffix}`, messageId: queuedMessage.id, type: "DELIVERED", occurredAt: new Date().toISOString(),
  }, "invalid-webhook-secret"));
  expect(invalidWebhook.status()).toBe(401);
  expect((await campaignDetail(request, token, campaignId)).messages[0]?.status).toBe("QUEUED");

  const providerFailure = await apiRequest<{ data: { sent: number; failed: number } }>(request, token, "POST", `/campaigns/${campaignId}/send-approved`, { confirm: true });
  expect(providerFailure.data).toMatchObject({ sent: 0, failed: 1 });
  detail = await campaignDetail(request, token, campaignId);
  expect(detail.messages[0]).toMatchObject({ status: "QUEUED", attemptCount: 1, failureReason: "EMAIL_PROVIDER_UNAVAILABLE" });
  expect(await mailpitCount(request)).toBe(mailBefore);

  const retryMessage = detail.messages[0]!;
  await apiRequest(request, token, "PUT", `/campaigns/messages/${retryMessage.id}`, {
    subject: "Recovered provider delivery",
    greeting: retryMessage.greeting,
    body: retryMessage.body,
    cta: retryMessage.cta,
    closing: retryMessage.closing,
  });
  await approveAndQueue(request, token, campaignId);
  const successfulSend = await apiRequest<{ data: { sent: number; failed: number } }>(request, token, "POST", `/campaigns/${campaignId}/send-approved`, { confirm: true });
  expect(successfulSend.data).toMatchObject({ sent: 1, failed: 0 });
  expect(await mailpitCount(request)).toBe(mailBefore + 1);

  const limitedCampaign = await createDraftCampaign(request, token, contactId, `Daily limit ${suffix}`);
  await approveAndQueue(request, token, limitedCampaign);
  const dailyLimited = await apiRequest<{ data: { sent: number; failed: number; dailyRemaining: number } }>(request, token, "POST", `/campaigns/${limitedCampaign}/send-approved`, { confirm: true });
  expect(dailyLimited.data).toMatchObject({ sent: 0, failed: 0, dailyRemaining: 0 });
  const limitedDetail = await campaignDetail(request, token, limitedCampaign);
  expect(limitedDetail.messages[0]?.status).toBe("QUEUED");
  expect(await mailpitCount(request)).toBe(mailBefore + 1);

  const bouncePayload = { providerEventId: `bounce-${suffix}`, messageId: limitedDetail.messages[0]!.id, type: "BOUNCED", occurredAt: new Date().toISOString() };
  const bounce = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook(bouncePayload));
  expect(bounce.status()).toBe(202);
  expect((await campaignDetail(request, token, limitedCampaign)).messages[0]?.status).toBe("BOUNCED");
  const duplicateBounce = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook(bouncePayload));
  expect((await duplicateBounce.json() as { data: { duplicate: boolean } }).data.duplicate).toBe(true);

  const sentDetail = await campaignDetail(request, token, campaignId);
  const complaint = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook({
    providerEventId: `complaint-${suffix}`, messageId: sentDetail.messages[0]!.id, type: "COMPLAINT", occurredAt: new Date().toISOString(),
  }));
  expect(complaint.status()).toBe(202);
  expect((await campaignDetail(request, token, campaignId)).recipients[0]?.status).toBe("OPTED_OUT");

  const suppressedCampaign = await createDraftCampaign(request, token, contactId, `Suppressed ${suffix}`);
  const suppression = await approveAndQueue(request, token, suppressedCampaign);
  expect(suppression.data).toEqual({ queued: 0, suppressed: 1 });
  expect(await mailpitCount(request)).toBe(mailBefore + 1);
});

test("renders safe not-found, mobile navigation, responsive pages, refresh persistence, and blocks admin", async ({ page, request }) => {
  const email = uniqueEmail("browser-failures", test.info().project.name);
  const token = (await registerApi(request, email)).token!;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/settings");
  await page.getByLabel("Company", { exact: true }).fill("Refresh Persistence Company");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue("Refresh Persistence Company");

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
    expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    if (viewport.width < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
      await page.getByRole("button", { name: "Close navigation" }).last().click();
    }
  }

  await page.goto("/definitely-not-a-route");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  const adminApi = await request.get(`${API_ORIGIN}/admin/overview`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(adminApi.status()).toBe(403);
});
