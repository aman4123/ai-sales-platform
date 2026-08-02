import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import { api } from "../services/api";
import { getLeadPage } from "../services/leadStorage";
import {
  confirmSalesGoal,
  cancelAdminJob,
  createCampaign,
  createAdminUser,
  createSupportSession,
  createSalesGoal,
  getAdminOverview,
  getAdminJobs,
  getAdminSystem,
  getAdminTenants,
  getAdminUsers,
  getAnalytics,
  getCampaigns,
  getCommandOverview,
  getInbox,
  getTasks,
  retryAdminJob,
  revokeAdminUserSessions,
  updateAdminUser,
  updateTenantAiBudget,
  updateTask,
} from "../services/v2";
import Admin from "./Admin";
import Analytics from "./Analytics";
import Campaigns from "./Campaigns";
import CommandCenter from "./CommandCenter";
import Inbox from "./Inbox";
import Leads from "./Leads";
import Legal from "./Legal";
import Tasks from "./Tasks";

vi.mock("../components/layout/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("../contexts/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: "master-1",
      email: "master@example.com",
      emailVerified: true,
      name: "Master Tester",
      role: "SUPER_ADMIN",
      accountRole: "SUPER_ADMIN",
      accessMode: "MASTER_ADMIN",
      availableModes: ["USER", "TESTER", "MASTER_ADMIN"],
      settings: { company: "", signature: "", aiProvider: "MOCK", theme: "DARK", notifications: true },
    },
  }),
}));
vi.mock("../services/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, apiErrorMessage: (_error: unknown, fallback: string) => fallback, setSupportContext: vi.fn() }));
vi.mock("../services/leadStorage", () => ({ getLeadPage: vi.fn() }));
vi.mock("../services/v2", () => ({
  cancelAdminJob: vi.fn(),
  confirmSalesGoal: vi.fn(),
  createAdminUser: vi.fn(),
  createCampaign: vi.fn(),
  createSupportSession: vi.fn(),
  createSalesGoal: vi.fn(),
  getAdminOverview: vi.fn(),
  getAdminJobs: vi.fn(),
  getAdminSystem: vi.fn(),
  getAdminTenants: vi.fn(),
  getAdminUsers: vi.fn(),
  getAnalytics: vi.fn(),
  getCampaigns: vi.fn(),
  getCommandOverview: vi.fn(),
  getInbox: vi.fn(),
  getTasks: vi.fn(),
  retryAdminJob: vi.fn(),
  revokeAdminUserSessions: vi.fn(),
  updateAdminUser: vi.fn(),
  updateTenantAiBudget: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const campaign = { id: "campaign-1", name: "India logistics", salesGoal: "Introduce product", productService: "Platform", status: "READY_FOR_REVIEW", contentVersion: 1, approvedVersion: null, dailySendingLimit: 25, createdAt: new Date().toISOString(), _count: { recipients: 1, messages: 1, approvals: 0 } };
const message = { id: "message-1", recipientId: "recipient-1", kind: "INITIAL", status: "DRAFT", subject: "Subject", greeting: "Hello Alex,", body: "Grounded body", cta: "Open to a review?", closing: "Best regards,", signature: "Sam", factsUsed: { wordCount: 12, averageWordsPerSentence: 8, spamWarnings: [] } };
function detail(status = "READY_FOR_REVIEW") { return { ...campaign, status, approvedVersion: status === "APPROVED" || status === "SCHEDULED" ? 1 : null, recipients: [{ id: "recipient-1", status: "PENDING", lead: null, contact: { name: "Alex" } }], messages: [message], approvals: status === "APPROVED" || status === "SCHEDULED" ? [{ id: "approval-1", approvalType: "INITIAL_ONLY", contentVersion: 1, createdAt: new Date().toISOString() }] : [] }; }
function mockApiGet(status = "READY_FOR_REVIEW") {
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (String(url).startsWith("/crm/contacts")) return { data: { data: { contacts: [] } } } as never;
    if (String(url) === "/settings") return { data: { data: { providerStatus: { email: { deliveryMode: "disabled" } } } } } as never;
    return { data: { data: { campaign: detail(status) } } } as never;
  });
}
const lead = { id: "lead-1", company: "Example Logistics", contact: "Alex", email: "alex@example.com", phone: null, industry: "Logistics", status: "INTERESTED" as const, value: "100", notes: null, score: 82, scoreReasons: ["Industry fit"], evidenceQuality: 0.8, confidence: 0.9, riskFlags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

function withRouter(node: React.ReactNode, path = "/") { return render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>); }

describe("V2 product workspaces", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(getLeadPage).mockResolvedValue({ leads: [lead], total: 1, nextCursor: null });
    vi.mocked(getCampaigns).mockResolvedValue([campaign]);
    vi.mocked(getAdminUsers).mockResolvedValue([]);
    vi.mocked(getAdminTenants).mockResolvedValue([]);
    vi.mocked(getAdminJobs).mockResolvedValue([]);
    vi.mocked(getAdminSystem).mockResolvedValue({ database: "UP", redis: "UP", webService: "UP", worker: "IN_PROCESS_BOUNDED", deploymentVersion: "test-revision", providers: { ai: { configured: false, model: "test" }, search: { enabled: false, configured: false, provider: "TAVILY", requiredEnvironmentVariable: "TAVILY_API_KEY", message: "Not configured" }, email: { enabled: false, mode: "disabled", provider: "log" } }, jobs: {}, salesDepartments: {} });
    mockApiGet();
    vi.mocked(api.post).mockResolvedValue({ data: { data: { created: 1, skipped: [] } } });
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } });
    vi.mocked(createCampaign).mockResolvedValue(campaign);
    vi.mocked(getCommandOverview).mockResolvedValue({ campaigns: [], currentTasks: [], recentResearch: [], pendingApprovals: 1, humanResponsesNeeded: 1, usage: { aiRequestsLast30Days: 2, searchRequests: 3 } });
  });

  it("prepares and confirms a command plan without launching work", async () => {
    const user = userEvent.setup();
    const draft = { id: "goal-1", statement: "Sell to logistics", status: "DRAFT" as const, createdAt: new Date().toISOString(), plan: { objective: "Sell to logistics", targetMarket: { industry: "Logistics" }, icp: { fit: "Possible fit" }, researchStrategy: "Use verified sources", expectedDataSources: ["TAVILY"], leadCriteria: ["Evidence"], emailApproach: "Grounded", followUpPlan: "Bounded", limits: { daily: 25 }, risks: ["Stale data"], requiredApprovals: ["Paid search", "Campaign launch"] } };
    vi.mocked(createSalesGoal).mockResolvedValue(draft);
    vi.mocked(confirmSalesGoal).mockResolvedValue({ ...draft, status: "CONFIRMED" });
    withRouter(<CommandCenter />);
    await user.type(screen.getByLabelText("Sales goal"), "Sell to logistics");
    await user.click(screen.getByRole("button", { name: "Prepare draft plan" }));
    expect(await screen.findByText("Draft campaign plan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Confirm plan only/ }));
    expect(confirmSalesGoal).toHaveBeenCalledWith("goal-1");
  });

  it("creates a campaign draft from explicit sender and goal inputs", async () => {
    const user = userEvent.setup();
    withRouter(<Campaigns />);
    await user.type(screen.getByLabelText("Campaign name"), "Campaign");
    await user.type(screen.getByLabelText("Sales goal"), "Introduce product");
    await user.type(screen.getByLabelText("Product or service"), "Platform");
    await user.type(screen.getByLabelText("Value proposition"), "Evidence-backed research");
    await user.type(screen.getByLabelText("Sender display name"), "Sam");
    await user.type(screen.getByLabelText("Sender email"), "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(createCampaign).toHaveBeenCalled());
  });

  it("supports recipient selection, generation, manual edits, and approval", async () => {
    const user = userEvent.setup();
    withRouter(<Campaigns />);
    await user.click(await screen.findByRole("button", { name: /India logistics/ }));
    await user.click(await screen.findByLabelText(/Example Logistics/));
    await user.click(screen.getByRole("button", { name: "Add selected recipients" }));
    await user.click(screen.getByLabelText(/I confirm this AI usage/));
    await user.click(screen.getByRole("button", { name: "Generate review drafts" }));
    await user.clear(await screen.findByLabelText("Subject 1"));
    await user.type(screen.getByLabelText("Subject 1"), "Edited subject");
    await user.click(screen.getByRole("button", { name: "Save manual edit" }));
    await user.click(screen.getByRole("button", { name: "Approve initial outreach" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/campaigns/campaign-1/approve", { approved: true, approvalType: "INITIAL_ONLY" }));
  });

  it("queues and controls only approved campaigns after explicit confirmations", async () => {
    const user = userEvent.setup();
    mockApiGet("APPROVED");
    withRouter(<Campaigns />);
    await user.click(await screen.findByRole("button", { name: /India logistics/ }));
    await user.click(await screen.findByLabelText(/I confirm the approved recipient list/));
    await user.click(screen.getByRole("button", { name: "Queue approved messages" }));
    expect(api.post).toHaveBeenCalledWith("/campaigns/campaign-1/queue", { confirm: true });
  });

  it("processes, pauses, and stops an explicitly authorized scheduled campaign", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    mockApiGet("SCHEDULED");
    withRouter(<Campaigns />);
    await user.click(await screen.findByRole("button", { name: /India logistics/ }));
    await user.click(await screen.findByLabelText(/I explicitly authorize processing/));
    await user.click(screen.getByRole("button", { name: "Send next approved batch" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(api.post).toHaveBeenCalledWith("/campaigns/campaign-1/send-approved", { confirm: true });
    expect(api.post).toHaveBeenCalledWith("/campaigns/campaign-1/pause", { confirm: true });
    expect(api.post).toHaveBeenCalledWith("/campaigns/campaign-1/stop", { confirm: true });
  });

  it("shows explainable leads and updates searches", async () => {
    const user = userEvent.setup();
    withRouter(<Leads />);
    expect(await screen.findByText("Score 82")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search leads"), "Example");
    await waitFor(() => expect(getLeadPage).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Example" })));
  });

  it("renders reply takeover, task actions, and observed analytics", async () => {
    vi.mocked(getInbox).mockResolvedValue([
      { id: "reply-1", classification: null, contentPreview: "Interested", requiresHuman: true, receivedAt: new Date().toISOString(), recipient: { id: "recipient-1", status: "REPLIED", campaign: { id: "campaign-1", name: "Campaign" }, contact: { name: "Alex", jobTitle: null }, lead: null } },
      { id: "reply-2", classification: null, contentPreview: null, requiresHuman: true, receivedAt: new Date().toISOString(), recipient: { id: "recipient-2", status: "REPLIED", campaign: { id: "campaign-1", name: "Campaign" }, contact: null, lead: null } },
    ]);
    const inbox = withRouter(<Inbox />);
    expect(await screen.findByText("Interested")).toBeInTheDocument();
    expect(screen.getByText("Message preview was not retained by the provider.")).toBeInTheDocument();
    inbox.unmount();

    vi.mocked(getTasks).mockResolvedValue([{ id: "task-1", type: "HUMAN_RESPONSE_REQUIRED", status: "OPEN", title: "Human response required.", description: "A reply arrived.", createdAt: new Date().toISOString() }]);
    vi.mocked(updateTask).mockResolvedValue({ id: "task-1", type: "HUMAN_RESPONSE_REQUIRED", status: "COMPLETED", title: "Human response required.", description: "A reply arrived.", createdAt: new Date().toISOString() });
    const tasks = withRouter(<Tasks />);
    await userEvent.selectOptions(await screen.findByLabelText("Status for Human response required."), "COMPLETED");
    expect(updateTask).toHaveBeenCalledWith("task-1", "COMPLETED");
    tasks.unmount();

    vi.mocked(getAnalytics).mockResolvedValue({ researchedLeads: 2, verifiedLeads: 1, approvedRecipients: 1, emailsQueued: 1, emailsSent: 1, delivered: 1, bounced: 0, replied: 1, optedOut: 0, humanTakeoverRequired: 1, responseRate: 1, positiveResponseRate: null, unavailableMetrics: ["Email opens are unavailable."] });
    withRouter(<Analytics />);
    expect(await screen.findByText("100.0%")).toBeInTheDocument();
    expect(screen.getByText(/Email opens are unavailable/)).toBeInTheDocument();
  });

  it("renders sanitized admin health and legal disclosures", async () => {
    vi.mocked(getAdminOverview).mockResolvedValue({ users: 10, activeUsers: 2, aiRequests: 3, searchRequests: 4, emailSends: 5, failedJobs: 0, providerHealth: { search: { enabled: false, configured: false, provider: "TAVILY", message: "Not configured" }, ai: { provider: "GROQ", configured: true }, email: { provider: "resend", outboundEnabled: false } }, monthlyBudget: { aiRequests: 10, searchRequests: 10, outboundDailyLimit: 25 }, abuseFlags: 0, campaignActivity: {}, auditLogs: [{ id: "audit-1", actorUserId: null, action: "CAMPAIGN_APPROVED", resourceType: "Campaign", resourceId: "campaign-1", requestId: "request-1", createdAt: new Date().toISOString() }] });
    const admin = withRouter(<Admin />);
    expect(await screen.findByText("CAMPAIGN_APPROVED")).toBeInTheDocument();
    admin.unmount();
    withRouter(<Legal />, "/privacy");
    expect(screen.getByRole("heading", { name: "Privacy principles" })).toBeInTheDocument();
  });

  it("renders alternate provider health and safe legal fallback states", async () => {
    vi.mocked(getAdminOverview).mockResolvedValue({ users: 0, activeUsers: 0, aiRequests: 0, searchRequests: 0, emailSends: 0, failedJobs: 0, providerHealth: { search: { enabled: true, configured: true, provider: "BRAVE", message: "Configured" }, ai: { provider: "GROQ", configured: false }, email: { provider: "resend", outboundEnabled: true } }, monthlyBudget: { aiRequests: 0, searchRequests: 0, outboundDailyLimit: 0 }, abuseFlags: 0, campaignActivity: {}, auditLogs: [] });
    const admin = withRouter(<Admin />);
    expect(await screen.findByText("Search: Configured")).toBeInTheDocument();
    expect(screen.getByText("AI: Not configured")).toBeInTheDocument();
    expect(screen.getByText("Outbound: Enabled")).toBeInTheDocument();
    admin.unmount();
    withRouter(<Legal />, "/unsupported-legal-page");
    expect(screen.getByRole("heading", { name: "Terms of use" })).toBeInTheDocument();
  });

  it("operates master user, tenant budget, session, and bounded job controls", async () => {
    const user = userEvent.setup();
    const adminUsers = [
      { id: "user-active", name: "Active User", email: "active@example.com", emailVerifiedAt: new Date().toISOString(), role: "MEMBER", status: "ACTIVE" as const, lastLoginAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), createdAt: new Date().toISOString(), tenantMemberships: [{ role: "SALES_USER", tenant: { id: "tenant-active", name: "Active Company", slug: "active", status: "ACTIVE" } }], _count: { sessions: 1, aiRequests: 2, campaigns: 1 } },
      { id: "user-suspended", name: "Suspended User", email: "suspended@example.com", emailVerifiedAt: null, role: "MEMBER", status: "SUSPENDED" as const, lastLoginAt: null, lastActiveAt: null, createdAt: new Date().toISOString(), tenantMemberships: [], _count: { sessions: 0, aiRequests: 0, campaigns: 0 } },
    ];
    const adminTenants = [
      { id: "tenant-active", name: "Active Company", slug: "active", status: "ACTIVE" as const, kind: "CUSTOMER" as const, owner: { id: "user-active", name: "Active User", email: "active@example.com" }, subscription: { id: "sub-1", status: "ACTIVE", plan: { code: "FREE_TRIAL", name: "Free Trial" } }, aiBudget: { id: "budget-1", mode: "LIMITED" as const, monthlyRequestLimit: 10, warningThresholdPercent: 80 }, companyProfile: { status: "APPROVED", version: 1, companyName: "Active Company", updatedAt: new Date().toISOString() }, _count: { memberships: 1, dailyBriefs: 1 } },
      { id: "tenant-archived", name: "Archived Company", slug: "archived", status: "ARCHIVED" as const, kind: "CUSTOMER" as const, owner: null, subscription: null, aiBudget: null, companyProfile: null, _count: { memberships: 0, dailyBriefs: 0 } },
    ];
    const jobs = [
      { id: "job-failed", tenantId: "tenant-active", category: "LEAD_DISCOVERY", status: "FAILED", attemptCount: 2, maxAttempts: 3, scheduledAt: new Date().toISOString(), nextAttemptAt: null, errorCode: "PROVIDER_FAILURE", errorMessage: "redacted", createdAt: new Date().toISOString() },
      { id: "job-pending", tenantId: "tenant-active", category: "DAILY_BRIEF", status: "PENDING", attemptCount: 0, maxAttempts: 3, scheduledAt: new Date().toISOString(), nextAttemptAt: null, errorCode: null, errorMessage: null, createdAt: new Date().toISOString() },
      { id: "job-complete", tenantId: "tenant-active", category: "ANALYTICS_REFRESH", status: "COMPLETED", attemptCount: 1, maxAttempts: 3, scheduledAt: new Date().toISOString(), nextAttemptAt: null, errorCode: null, errorMessage: null, createdAt: new Date().toISOString() },
    ];
    vi.mocked(getAdminOverview).mockResolvedValue({ users: 2, activeUsers: 1, aiRequests: 2, searchRequests: 3, emailSends: 0, failedJobs: 1, providerHealth: { search: { enabled: true, configured: true, provider: "TAVILY", message: "Configured" }, ai: { provider: "GROQ", configured: true }, email: { provider: "resend", outboundEnabled: false } }, monthlyBudget: { aiRequests: 10, searchRequests: 5, outboundDailyLimit: 0 }, abuseFlags: 1, campaignActivity: {}, auditLogs: [{ id: "audit-null", actorUserId: null, action: "ADMIN_VIEWED", resourceType: "System", resourceId: null, requestId: null, createdAt: new Date().toISOString() }] });
    vi.mocked(getAdminUsers).mockResolvedValue(adminUsers);
    vi.mocked(getAdminTenants).mockResolvedValue(adminTenants);
    vi.mocked(getAdminJobs).mockResolvedValue(jobs);
    vi.mocked(createAdminUser).mockResolvedValue({ user: { id: "new-user", name: "New User", email: "new@example.com", status: "ACTIVE" }, invitationDelivered: false });
    vi.mocked(revokeAdminUserSessions).mockResolvedValue(1);
    vi.mocked(createSupportSession).mockRejectedValue(new Error("support unavailable"));
    vi.mocked(updateTenantAiBudget).mockResolvedValue(adminTenants[0].aiBudget);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Approved operator reason");

    withRouter(<Admin />);
    expect(await screen.findByText("Active User")).toBeInTheDocument();
    expect(screen.getByText("Suspended User")).toBeInTheDocument();
    expect(screen.getByText("Unverified")).toBeInTheDocument();
    expect(screen.getByText("No plan · 0 user(s) · ARCHIVED")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "New User");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.selectOptions(screen.getByLabelText("Company workspace"), "tenant-active");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(createAdminUser).toHaveBeenCalledWith({ name: "New User", email: "new@example.com", tenantId: "tenant-active" }));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Email delivery is unavailable"));

    await user.click(screen.getAllByRole("button", { name: "Suspend" })[0]);
    await waitFor(() => expect(updateAdminUser).toHaveBeenCalledWith("user-active", { status: "SUSPENDED" }));
    await user.click(screen.getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(updateAdminUser).toHaveBeenCalledWith("user-suspended", { status: "ACTIVE" }));
    await user.click(screen.getAllByRole("button", { name: "Revoke sessions" })[0]);
    await waitFor(() => expect(revokeAdminUserSessions).toHaveBeenCalledWith("user-active", "Master Admin security action"));
    await user.click(screen.getAllByRole("button", { name: "View as user" })[1]);
    expect(toast.error).toHaveBeenCalledWith("This user is not assigned to a company workspace.");
    await user.click(screen.getAllByRole("button", { name: "View as user" })[0]);
    await waitFor(() => expect(createSupportSession).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: "user-active", accessLevel: "READ_ONLY" })));

    const modes = screen.getAllByLabelText("AI mode");
    const limits = screen.getAllByLabelText("Monthly requests");
    fireEvent.change(modes[0], { target: { value: "LIMITED" } });
    fireEvent.change(limits[0], { target: { value: "25" } });
    await user.click(screen.getAllByRole("button", { name: "Save budget" })[0]);
    await waitFor(() => expect(updateTenantAiBudget).toHaveBeenCalledWith("tenant-active", expect.objectContaining({ mode: "LIMITED", monthlyRequestLimit: 25 })));
    fireEvent.change(modes[1], { target: { value: "INTERNAL_UNLIMITED" } });
    await user.click(screen.getAllByRole("button", { name: "Save budget" })[1]);
    await waitFor(() => expect(updateTenantAiBudget).toHaveBeenCalledWith("tenant-archived", expect.objectContaining({ mode: "INTERNAL_UNLIMITED", monthlyRequestLimit: 0 })));

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(retryAdminJob).toHaveBeenCalledWith("job-failed", "Approved operator reason"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelAdminJob).toHaveBeenCalledWith("job-pending", "Approved operator reason"));
    expect(confirm).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalled();
  });

  it("renders honest empty states without synthetic records", async () => {
    vi.mocked(getLeadPage).mockResolvedValueOnce({ leads: [], total: 0, nextCursor: null });
    const leads = withRouter(<Leads />);
    expect(await screen.findByText(/No matching leads/)).toBeInTheDocument();
    leads.unmount();
    vi.mocked(getInbox).mockResolvedValueOnce([]);
    const inbox = withRouter(<Inbox />);
    expect(await screen.findByText("No replies need human review.")).toBeInTheDocument();
    inbox.unmount();
    vi.mocked(getTasks).mockResolvedValueOnce([]);
    withRouter(<Tasks />);
    expect(await screen.findByText("No tasks are waiting.")).toBeInTheDocument();
  });
});
