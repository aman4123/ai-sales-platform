import { expect, test, type APIRequestContext } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import {
  API_ORIGIN,
  apiRequest,
  loginToken,
  registerAndOpenDashboard,
  signedWebhook,
  uniqueEmail,
} from "./helpers.js";

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  contentVersion: number;
  approvedVersion: number | null;
  recipients: Array<{ id: string; status: string }>;
  messages: Array<{ id: string; kind: string; status: string; body: string; failureReason: string | null }>;
  approvals: Array<{ id: string; contentVersion: number; messageSnapshot: unknown }>;
}

interface MailpitMessages { messages?: Array<{ Subject?: string }> }

async function mailpitSubjectCount(request: APIRequestContext, subject: string) {
  const response = await request.get("http://127.0.0.1:58025/api/v1/messages");
  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = await response.json() as MailpitMessages;
  return payload.messages?.filter((message) => message.Subject === subject).length ?? 0;
}

test("completes the human-approved V2 journey with grounded research and safe delivery", async ({ page, request }) => {
  test.setTimeout(180_000);
  const suffix = `${test.info().project.name}-${Date.now()}`;
  const email = uniqueEmail("critical", test.info().project.name);

  await page.goto("/");
  await page.getByRole("link", { name: "Start Free" }).first().click();
  await registerAndOpenDashboard(page, email, "Critical Journey User");
  const token = await loginToken(request, email);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByLabel("AI provider").selectOption("GROQ");
  await page.getByLabel("Sender name").fill("Critical Journey Sender");
  await page.getByLabel("Sender email").fill("e2e-sender@example.test");
  await page.getByLabel("Exact saved signature").fill("Regards,\nCritical Journey Sender");
  await page.getByLabel("Unsubscribe footer").fill("Reply unsubscribe to stop future messages.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(page.getByText(/test mode/)).toBeVisible();

  await page.goto("/command");
  await page.getByLabel("Sales goal").fill("Reach one evidence-backed logistics account safely");
  await page.getByLabel("Product or service").fill("Human-approved sales workflow");
  await page.getByLabel("Target industry").fill("Logistics");
  await page.getByLabel("Geography").fill("Test region");
  await page.getByLabel("Preferred buyer role").fill("Operations leader");
  await page.getByRole("button", { name: "Prepare draft plan" }).click();
  await expect(page.getByRole("heading", { name: "Draft campaign plan" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm plan only" }).click();
  await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();

  await page.route("**/api/research/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { enabled: false, provider: "TAVILY", configured: false, message: "Search is disabled in this safe-state check." } }),
    });
  }, { times: 1 });
  await page.goto("/research");
  await expect(page.getByText("Live search disabled")).toBeVisible();
  await expect(page.getByText("Search is disabled in this safe-state check.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start verified research" })).toBeDisabled();
  await page.unroute("**/api/research/status");
  await page.reload();
  await expect(page.getByText("TAVILY configured")).toBeVisible();

  await page.getByLabel("What market or company should be researched?").fill("Northstar Logistics public company profile");
  await page.getByLabel(/I confirm this paid search request/).check();
  await page.getByRole("button", { name: "Start verified research" }).click();
  await expect(page.getByRole("heading", { name: "Northstar Logistics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verified facts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unknown / not verified" })).toBeVisible();
  await expect(page.getByText(/Not verified/).first()).toBeVisible();
  await expect(page.locator("details a").first()).toHaveAttribute("href", "https://northstar-logistics.example");
  await expect(page.getByText("Unsupported fixture claim")).toHaveCount(0);
  await page.getByRole("button", { name: "Save to CRM" }).click();
  await expect(page.getByText("Company saved to CRM.")).toBeVisible();

  const researchAccessibility = await new AxeBuilder({ page }).analyze();
  expect(researchAccessibility.violations).toEqual([]);

  await page.goto("/crm");
  await expect(page.getByText("Northstar Logistics", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Saved company").selectOption({ label: "Northstar Logistics" });
  await page.getByLabel("Contact name").fill("Casey Morgan");
  await page.getByLabel("Public job title").fill("Operations Director");
  await page.getByLabel("Public professional email").fill("recipient@example.test");
  await page.getByLabel("Public source URL").fill("https://northstar-logistics.example/team");
  await page.getByRole("button", { name: "Add public contact" }).click();
  await expect(page.getByText("Public professional contact added.")).toBeVisible();
  await expect(page.getByText(/Casey Morgan/)).toBeVisible();

  const contacts = await apiRequest<{ data: { contacts: Array<{ id: string; name: string }> } }>(request, token, "GET", "/crm/contacts?limit=100");
  const contact = contacts.data.contacts.find((item) => item.name === "Casey Morgan");
  expect(contact).toBeTruthy();

  await page.goto("/campaigns");
  await expect(page.getByText(/Delivery mode: test/)).toBeVisible();
  await page.getByLabel("Campaign name").fill(`Northstar RC ${suffix}`);
  await page.getByLabel("Sales goal").fill("Start a human-reviewed logistics conversation");
  await page.getByLabel("Product or service").fill("Human-approved sales workflow");
  await page.getByLabel("Value proposition").fill("Keeps evidence, approval, and delivery controls visible");
  await page.getByLabel("Sender display name").fill("Critical Journey Sender");
  await page.getByLabel("Sender email").fill("e2e-sender@example.test");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Draft campaign created. Nothing has been sent.")).toBeVisible();

  const campaignList = await apiRequest<{ data: { campaigns: Array<{ id: string; name: string }> } }>(request, token, "GET", "/campaigns");
  const campaign = campaignList.data.campaigns.find((item) => item.name === `Northstar RC ${suffix}`);
  expect(campaign).toBeTruthy();
  await apiRequest(request, token, "PUT", `/campaigns/${campaign!.id}`, {
    sequenceConfig: { followUps: [{ delayDays: 1, enabled: true }] },
  });
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`Northstar RC ${suffix}`) }).click();

  await page.getByLabel(/Northstar Logistics.*Casey Morgan.*recipient@example\.test/).check();
  await page.getByRole("button", { name: "Add selected recipients" }).click();
  await expect(page.getByText("Recipients added. Approval is required again after recipient changes.")).toBeVisible();
  await page.getByLabel(/I confirm this AI usage/).check();
  await page.getByRole("button", { name: "Generate review drafts" }).click();
  await expect(page.getByText("2 grounded draft(s) prepared for review.")).toBeVisible();
  const campaignSubject = `Northstar reviewed ${suffix}`;
  await page.getByLabel("Subject 1").fill(campaignSubject);
  await expect(page.getByLabel("Body 1")).toHaveValue(/Northstar Logistics/);
  await page.getByLabel("Body 1").fill("I am reaching out about Human-approved sales workflow for Northstar Logistics. This note uses the reviewed public evidence.");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/campaigns/messages/") && response.request().method() === "PUT" && response.ok()),
    page.getByRole("button", { name: "Save manual edit" }).first().click(),
  ]);
  await expect(page.getByText("Draft updated. Previous approval was invalidated.")).toBeVisible();

  await page.getByRole("button", { name: "Approve initial outreach" }).click();
  await expect(page.getByText("Current recipients and initial messages approved.")).toBeVisible();
  let detail = (await apiRequest<{ data: { campaign: CampaignDetail } }>(request, token, "GET", `/campaigns/${campaign!.id}`)).data.campaign;
  expect(detail.approvedVersion).toBe(detail.contentVersion);
  expect(detail.approvals).toHaveLength(1);
  expect(detail.approvals[0]?.messageSnapshot).toBeTruthy();
  const approvedVersion = detail.contentVersion;

  await page.getByLabel("Body 1").fill("I am reaching out about Human-approved sales workflow for Northstar Logistics. A person reviewed this updated wording.");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/campaigns/messages/") && response.request().method() === "PUT" && response.ok()),
    page.getByRole("button", { name: "Save manual edit" }).first().click(),
  ]);
  detail = (await apiRequest<{ data: { campaign: CampaignDetail } }>(request, token, "GET", `/campaigns/${campaign!.id}`)).data.campaign;
  expect(detail.contentVersion).toBeGreaterThan(approvedVersion);
  expect(detail.approvedVersion).toBeNull();
  const prematureQueue = await request.post(`${API_ORIGIN}/campaigns/${campaign!.id}/queue`, {
    headers: { authorization: `Bearer ${token}` }, data: { confirm: true },
  });
  expect(prematureQueue.status()).toBe(409);
  detail = (await apiRequest<{ data: { campaign: CampaignDetail } }>(request, token, "GET", `/campaigns/${campaign!.id}`)).data.campaign;
  expect(detail.messages.some((message) => message.status === "QUEUED")).toBeFalsy();

  await page.getByRole("button", { name: "Approve initial outreach" }).click();
  const mailBeforeQueue = await mailpitSubjectCount(request, campaignSubject);
  await page.getByLabel(/I confirm the approved recipient list/).check();
  await page.getByRole("button", { name: "Queue approved messages" }).click();
  await expect(page.getByText("Approved messages queued. Sending remains provider-gated.")).toBeVisible();
  expect(await mailpitSubjectCount(request, campaignSubject)).toBe(mailBeforeQueue);

  await page.getByLabel(/I explicitly authorize processing/).check();
  await page.getByRole("button", { name: "Send next approved batch" }).click();
  await expect(page.getByText("The next approved, due batch was processed.")).toBeVisible();
  await expect.poll(() => mailpitSubjectCount(request, campaignSubject)).toBe(mailBeforeQueue + 1);

  detail = (await apiRequest<{ data: { campaign: CampaignDetail } }>(request, token, "GET", `/campaigns/${campaign!.id}`)).data.campaign;
  const initial = detail.messages.find((message) => message.kind === "INITIAL");
  const followUp = detail.messages.find((message) => message.kind === "FOLLOW_UP_1");
  expect(initial?.status).toBe("SENT");
  expect(followUp?.status).toBe("DRAFT");
  expect(detail.recipients).toHaveLength(1);

  const occurredAt = new Date().toISOString();
  const delivered = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook({
    providerEventId: `delivered-${suffix}`, messageId: initial!.id, type: "DELIVERED", occurredAt,
  }));
  expect(delivered.status()).toBe(202);
  const replyPayload = { providerEventId: `reply-${suffix}`, messageId: initial!.id, type: "REPLIED", occurredAt: new Date().toISOString() };
  const replied = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook(replyPayload));
  expect(replied.status()).toBe(202);
  const duplicateReply = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook(replyPayload));
  expect((await duplicateReply.json() as { data: { duplicate: boolean } }).data.duplicate).toBe(true);

  detail = (await apiRequest<{ data: { campaign: CampaignDetail } }>(request, token, "GET", `/campaigns/${campaign!.id}`)).data.campaign;
  expect(detail.recipients[0]?.status).toBe("REPLIED");
  expect(detail.messages.find((message) => message.kind === "FOLLOW_UP_1")?.status).toBe("CANCELLED");

  await page.goto("/inbox");
  await expect(page.getByText("Human response required")).toBeVisible();
  await expect(page.getByText(`Northstar RC ${suffix}`)).toBeVisible();
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Human response required." })).toBeVisible();

  const unsubscribed = await request.post(`${API_ORIGIN}/webhooks/email/smtp`, signedWebhook({
    providerEventId: `unsubscribe-${suffix}`, messageId: initial!.id, type: "UNSUBSCRIBED", occurredAt: new Date().toISOString(),
  }));
  expect(unsubscribed.status()).toBe(202);

  const suppressedCampaign = await apiRequest<{ data: { campaign: { id: string } } }>(request, token, "POST", "/campaigns", {
    name: `Suppression proof ${suffix}`,
    salesGoal: "Prove suppression remains enforced",
    productService: "Human-approved sales workflow",
    valueProposition: "Keeps evidence and approval visible",
    audienceFilters: {},
    senderIdentity: { displayName: "Critical Journey Sender", email: "e2e-sender@example.test" },
    tone: "Professional",
    sequenceConfig: { followUps: [] },
    schedule: { timezone: "UTC", weekdays: [1, 2, 3, 4, 5], windowStart: "09:00", windowEnd: "17:00" },
    dailySendingLimit: 25,
  }, 201);
  await apiRequest(request, token, "POST", `/campaigns/${suppressedCampaign.data.campaign.id}/recipients`, { leadIds: [], contactIds: [contact!.id] }, 201);
  await apiRequest(request, token, "POST", `/campaigns/${suppressedCampaign.data.campaign.id}/drafts`, { confirm: true }, 201);
  await apiRequest(request, token, "POST", `/campaigns/${suppressedCampaign.data.campaign.id}/approve`, { approved: true, approvalType: "INITIAL_ONLY" }, 201);
  const suppressionQueue = await apiRequest<{ data: { queued: number; suppressed: number } }>(request, token, "POST", `/campaigns/${suppressedCampaign.data.campaign.id}/queue`, { confirm: true });
  expect(suppressionQueue.data).toEqual({ queued: 0, suppressed: 1 });
  expect(await mailpitSubjectCount(request, campaignSubject)).toBe(mailBeforeQueue + 1);

  await page.goto("/analytics");
  await expect(page.getByText("Observed activity only")).toBeVisible();
  await expect(page.getByText("Unavailable metrics")).toBeVisible();
  await page.goto("/campaigns");
  await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  const campaignAccessibility = await new AxeBuilder({ page }).analyze();
  expect(campaignAccessibility.violations).toEqual([]);

  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  if (await openNavigation.isVisible()) await openNavigation.click();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/campaigns");
  await expect(page).toHaveURL(/\/login$/);
});
