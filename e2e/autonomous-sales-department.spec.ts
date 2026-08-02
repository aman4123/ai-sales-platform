import { expect, test, type APIRequestContext } from "@playwright/test";
import { API_ORIGIN, apiRequest } from "./helpers.js";

const masterEmail = "master-e2e@example.test";
const masterPassword = "e2e-master-password-strong";

async function mailpitCount(request: APIRequestContext) {
  const response = await request.get("http://127.0.0.1:58025/api/v1/messages");
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = await response.json() as { total?: number; messages?: unknown[] };
  return payload.total ?? payload.messages?.length ?? 0;
}

test("runs the owner self-selling automation in an isolated Tester workspace", async ({ request }) => {
  test.skip(test.info().project.name !== "chromium", "The fixed bootstrap identity is verified once in the Chromium project.");
  test.setTimeout(120_000);

  const resetRequest = await request.post(`${API_ORIGIN}/auth/password-reset/request`, { data: { email: masterEmail } });
  expect(resetRequest.status(), await resetRequest.text()).toBe(202);
  const resetPayload = await resetRequest.json() as { data: { developmentResetToken?: string } };
  expect(resetPayload.data.developmentResetToken).toBeTruthy();
  const reset = await request.post(`${API_ORIGIN}/auth/password-reset/confirm`, {
    data: { token: resetPayload.data.developmentResetToken, password: masterPassword },
  });
  expect(reset.status(), await reset.text()).toBe(204);

  const login = await request.post(`${API_ORIGIN}/auth/login`, { data: { email: masterEmail, password: masterPassword } });
  expect(login.status(), await login.text()).toBe(200);
  const loginPayload = await login.json() as { data: { accessToken: string; user: { role: string; tenant: { kind: string } } } };
  expect(loginPayload.data.user).toMatchObject({ role: "MASTER_ADMIN", tenant: { kind: "INTERNAL" } });

  const masterToken = loginPayload.data.accessToken;
  const internalTenants = await apiRequest<{ data: { tenants: Array<{ kind: string; aiBudget: { mode: string } | null; subscription: { plan: { code: string } } | null }> } }>(request, masterToken, "GET", "/admin/tenants");
  expect(internalTenants.data.tenants.some((tenant) => tenant.kind === "INTERNAL" && tenant.aiBudget?.mode === "INTERNAL_UNLIMITED" && tenant.subscription?.plan.code === "INTERNAL")).toBe(true);

  const supportTargetEmail = `support-target-${Date.now()}@example.test`;
  const supportTarget = await apiRequest<{ data: { user: { id: string } } }>(request, masterToken, "POST", "/admin/users", { name: "Support Target", email: supportTargetEmail }, 201);
  const adminUsers = await apiRequest<{ data: { users: Array<{ id: string; tenantMemberships: Array<{ tenant: { id: string } }> }> } }>(request, masterToken, "GET", "/admin/users");
  const targetMembership = adminUsers.data.users.find((user) => user.id === supportTarget.data.user.id)?.tenantMemberships[0];
  expect(targetMembership).toBeTruthy();
  const support = await apiRequest<{ data: { session: { id: string } } }>(request, masterToken, "POST", "/admin/support-sessions", {
    targetUserId: supportTarget.data.user.id,
    tenantId: targetMembership!.tenant.id,
    accessLevel: "READ_ONLY",
    reason: "Verify visible, audited read-only support isolation in E2E.",
    durationMinutes: 15,
    confirm: true,
  }, 201);
  const supportedRead = await request.get(`${API_ORIGIN}/crm/companies`, { headers: { authorization: `Bearer ${masterToken}`, "x-support-session-id": support.data.session.id } });
  expect(supportedRead.status(), await supportedRead.text()).toBe(200);
  expect(supportedRead.headers()["x-support-mode"]).toBe("read_only");
  const blockedSupportWrite = await request.post(`${API_ORIGIN}/crm/companies`, { headers: { authorization: `Bearer ${masterToken}`, "x-support-session-id": support.data.session.id }, data: { name: "Must not be created" } });
  expect(blockedSupportWrite.status(), await blockedSupportWrite.text()).toBe(403);
  await apiRequest(request, masterToken, "POST", `/admin/support-sessions/${support.data.session.id}/end`, { confirm: true, reason: "Read-only support verification completed." });

  const testerMode = await request.post(`${API_ORIGIN}/auth/mode`, {
    headers: { authorization: `Bearer ${masterToken}` },
    data: { mode: "TESTER" },
  });
  expect(testerMode.status(), await testerMode.text()).toBe(200);
  const testerPayload = await testerMode.json() as { data: { accessToken: string; user: { accessMode: string; tenant: { id: string; kind: string } } } };
  expect(testerPayload.data.user).toMatchObject({ accessMode: "TESTER", tenant: { kind: "TEST" } });
  const testerToken = testerPayload.data.accessToken;

  const profile = {
    companyName: "AI Sales Platform",
    website: "https://example.test",
    industry: "Business software",
    description: "A bounded AI Sales Department for evidence-backed sales operations.",
    products: ["Autonomous AI Sales Department"],
    services: [],
    useCases: ["Public-evidence prospect research", "Approval-gated outreach"],
    pricingSummary: "Pricing is not approved for autonomous commitments.",
    targetIndustries: ["Logistics", "B2B services"],
    targetCompanySizes: ["Small and mid-sized businesses"],
    targetJobTitles: ["Sales leader", "Operations leader"],
    targetLocations: ["India"],
    exclusions: ["Consumers", "Prohibited or deceptive businesses"],
    valuePropositions: ["Keeps evidence, approval, tenant isolation, and stop controls visible."],
    competitors: [], caseStudies: [], testimonials: [], faqs: [], commonObjections: [], knowledgeSources: [],
    preferredTone: "Professional",
    complianceRequirements: ["Use only public business evidence", "Honor opt-outs immediately"],
    contactDetails: { email: masterEmail, phone: "", address: "Test workspace address — not for live sending" },
    meetingPreferences: { timezone: "Asia/Kolkata", schedulingUrl: "", assignedCloser: "Founding sales owner" },
  };
  await apiRequest(request, testerToken, "PUT", "/settings/company-profile", profile);
  await apiRequest(request, testerToken, "POST", "/settings/company-profile/approve", { confirm: true });

  const goal = await apiRequest<{ data: { goal: { id: string } } }>(request, testerToken, "POST", "/command/goals", {
    goal: "Find businesses that could benefit from an Autonomous AI Sales Department",
    productService: "Autonomous AI Sales Department",
    targetIndustry: "B2B services",
    geography: "India",
    preferredBuyerRole: "Sales leader",
    dailySendingLimit: 5,
  }, 201);
  await apiRequest(request, testerToken, "POST", `/command/goals/${goal.data.goal.id}/confirm`, { confirmed: true });

  await apiRequest(request, testerToken, "PUT", "/sales-department/config", {
    mode: "MANUAL",
    outreachGoal: "Find businesses that could benefit from an Autonomous AI Sales Department.",
    searchLocations: ["India"],
    approvedClaims: ["The platform supports evidence-backed research and approval-gated outreach."],
    prohibitedClaims: ["Guaranteed sales", "Unapproved pricing", "Human identity claims"],
    approvalPolicy: { newAudience: true, firstOutreach: true, sensitiveReplies: true, pricing: true, proposals: true, contracts: true },
    dailyContactLimit: 5,
    monthlyContactLimit: 50,
    maximumFollowUps: 2,
    maximumRetries: 2,
    quietHours: { timezone: "Asia/Kolkata", start: "18:00", end: "09:00" },
    budgetMinor: 0,
    currency: "USD",
    senderIdentity: { name: "Ava", role: "AI Sales Representative", email: "ava@example.test", disclosure: "AI Sales Representative working with the AI Sales Platform sales team." },
    humanMeetingOwner: "Founding sales owner",
  });

  const ready = await apiRequest<{ data: { canStart: boolean; workspace: { dataLabel: string }; providers: { research: { configured: boolean } } } }>(request, testerToken, "GET", "/sales-department/status");
  expect(ready.data).toMatchObject({ canStart: true, workspace: { dataLabel: "TEST" }, providers: { research: { configured: true } } });
  const mailBefore = await mailpitCount(request);
  await apiRequest(request, testerToken, "POST", "/sales-department/start", { confirm: true }, 202);

  await expect.poll(async () => {
    const jobs = await apiRequest<{ data: { jobs: Array<{ category: string; status: string }> } }>(request, testerToken, "GET", "/sales-department/jobs");
    return jobs.data.jobs.some((job) => job.category === "CRM_SYNCHRONIZATION" && job.status === "COMPLETED");
  }, { timeout: 45_000, intervals: [1_000] }).toBe(true);

  const companies = await apiRequest<{ data: { companies: Array<{ id: string; name: string }> } }>(request, testerToken, "GET", "/crm/companies?limit=100");
  expect(companies.data.companies.some((company) => company.name === "Northstar Logistics")).toBe(true);
  const company = companies.data.companies.find((item) => item.name === "Northstar Logistics")!;
  await apiRequest(request, testerToken, "POST", "/crm/deals", { companyId: company.id, name: "Northstar test opportunity", stage: "QUALIFYING", value: 0, currency: "USD" }, 201);
  const brief = await apiRequest<{ data: { brief: { dataLabel: string; metrics: { leadsDiscovered: number; opportunitiesCreated: number; revenue: number } } } }>(request, testerToken, "POST", "/operations/daily-brief/generate", { confirm: true });
  expect(brief.data.brief.dataLabel).toBe("TEST");
  expect(brief.data.brief.metrics.leadsDiscovered).toBeGreaterThan(0);
  expect(brief.data.brief.metrics.opportunitiesCreated).toBeGreaterThan(0);
  expect(brief.data.brief.metrics.revenue).toBe(0);
  expect(await mailpitCount(request)).toBe(mailBefore);

  await apiRequest(request, testerToken, "POST", "/sales-department/pause", { confirm: true, reason: "End of isolated E2E self-selling verification." });
  const masterAgain = await request.post(`${API_ORIGIN}/auth/mode`, {
    headers: { authorization: `Bearer ${testerToken}` },
    data: { mode: "MASTER_ADMIN" },
  });
  expect(masterAgain.status(), await masterAgain.text()).toBe(200);
  const masterAgainPayload = await masterAgain.json() as { data: { accessToken: string } };
  const system = await apiRequest<{ data: { database: string; webService: string; jobs: Record<string, number> } }>(request, masterAgainPayload.data.accessToken, "GET", "/admin/system");
  expect(system.data).toMatchObject({ database: "UP", webService: "UP" });
  expect(system.data.jobs.COMPLETED).toBeGreaterThan(0);
});
