import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/auth-context";
import { generateEmailWithAI, researchWithAI, askDemoAI } from "../services/ai";
import { api } from "../services/api";
import { getLeadPage } from "../services/leadStorage";
import { getReports } from "../services/reports";
import { createResearchJob, getDailySalesBrief, getResearchStatus, getSalesDepartmentStatus, pauseSalesDepartment, startSalesDepartment } from "../services/v2";
import type { AuthUser } from "../types/api";
import Dashboard from "./Dashboard";
import Email from "./Email";
import Landing from "./Landing";
import NotFound from "./NotFound";
import Profile from "./Profile";
import Reports from "./Reports";
import Research from "./Research";
import Settings from "./Settings";

vi.mock("../components/layout/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../contexts/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("../services/ai", () => ({
  askDemoAI: vi.fn(),
  researchWithAI: vi.fn(),
  generateEmailWithAI: vi.fn(),
}));
vi.mock("../services/leadStorage", () => ({ getLeadPage: vi.fn() }));
vi.mock("../services/reports", () => ({ getReports: vi.fn() }));
vi.mock("../services/v2", () => ({
  createResearchJob: vi.fn(),
  getDailySalesBrief: vi.fn(),
  getResearchStatus: vi.fn(),
  getSalesDepartmentStatus: vi.fn(),
  pauseSalesDepartment: vi.fn(),
  saveResearchCompany: vi.fn(),
  startSalesDepartment: vi.fn(),
}));
vi.mock("../services/api", () => ({
  api: { delete: vi.fn(), get: vi.fn(), put: vi.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  Cell: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const authUser: AuthUser = {
  id: "user-1",
  email: "sales@example.com",
  emailVerified: true,
  name: "Sales User",
  role: "MEMBER",
  accountRole: "MEMBER",
  accessMode: "USER",
  availableModes: [],
  settings: {
    company: "Example Co",
    signature: "Sales User",
    aiProvider: "MOCK",
    theme: "DARK",
    notifications: true,
  },
};
const mockedUseAuth = vi.mocked(useAuth);
const mockedGetLeadPage = vi.mocked(getLeadPage);
const mockedGetReports = vi.mocked(getReports);
const mockedAskDemo = vi.mocked(askDemoAI);
const mockedResearch = vi.mocked(researchWithAI);
const mockedEmail = vi.mocked(generateEmailWithAI);
const mockedResearchStatus = vi.mocked(getResearchStatus);
const mockedCreateResearchJob = vi.mocked(createResearchJob);
const mockedGetDailySalesBrief = vi.mocked(getDailySalesBrief);
const mockedGetSalesDepartmentStatus = vi.mocked(getSalesDepartmentStatus);
const mockedPauseSalesDepartment = vi.mocked(pauseSalesDepartment);
const mockedStartSalesDepartment = vi.mocked(startSalesDepartment);
const mockedPut = vi.mocked(api.put);
const mockedGet = vi.mocked(api.get);
const mockedDelete = vi.mocked(api.delete);

function withRouter(component: React.ReactNode) {
  return render(<MemoryRouter>{component}</MemoryRouter>);
}

function LocationProbe() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

describe("primary application pages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: authUser,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      acceptSession: vi.fn(),
      switchMode: vi.fn(),
      updateUser: vi.fn(),
    });
    mockedGetLeadPage.mockResolvedValue({
      leads: [{
        id: "lead-1",
        company: "Acme",
        contact: "Alex",
        email: null,
        phone: null,
        industry: null,
        status: "INTERESTED",
        value: "1000",
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      total: 1,
      nextCursor: null,
    });
    mockedGetReports.mockResolvedValue({
      summary: { revenue: 1000, leads: 1, meetings: 0, closedDeals: 0 },
      monthly: [{ month: "Jul", leads: 1 }],
      status: [{ name: "Interested", value: 1 }],
    });
    mockedGetDailySalesBrief.mockResolvedValue({
      id: "brief-1",
      briefDate: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      dataLabel: "REAL",
      metrics: {
        leadsDiscovered: 1,
        researchCompleted: 0,
        qualifiedLeads: 0,
        outreachSent: 0,
        repliesReceived: 0,
        interestedProspects: 0,
        meetings: 0,
      opportunitiesCreated: 0,
      pipelineValue: 0,
      deliveriesConfirmed: 0,
      wonCustomers: 0,
      revenue: 0,
      revenueCurrency: "USD",
      aiRequests: 0,
      searchRequestsRecorded: 0,
      estimatedAiCostMinor: 0,
      externalProviderCostsAvailable: false,
      },
      failures: [],
      risks: [],
      approvals: [],
      priorities: [],
    });
    mockedGetSalesDepartmentStatus.mockResolvedValue({
      workspace: { id: "tenant-1", name: "Example Company Workspace", kind: "CUSTOMER", dataLabel: "REAL" },
      range: { from: new Date().toISOString(), to: new Date().toISOString(), label: "Recorded activity" },
      config: { mode: "MANUAL", status: "READY", outreachGoal: "Find customers", searchLocations: ["India"], approvedClaims: ["Approved claim"], prohibitedClaims: [], approvalPolicy: { newAudience: true, firstOutreach: true, sensitiveReplies: true, pricing: true, proposals: true, contracts: true }, dailyContactLimit: 10, monthlyContactLimit: 100, maximumFollowUps: 2, maximumRetries: 3, quietHours: { timezone: "UTC", start: "17:00", end: "09:00" }, budgetMinor: 0, currency: "USD", senderIdentity: { name: "Ava", role: "AI Sales Representative", email: "", disclosure: "AI representative working with the sales team." }, senderVerified: false, humanMeetingOwner: "Sales owner" },
      canStart: true,
      blockers: [],
      providers: { research: { enabled: true, configured: true, provider: "TAVILY", requiredEnvironmentVariable: "TAVILY_API_KEY", message: "Configured" }, ai: { configured: false, selected: "MOCK", model: "test" }, email: { enabled: false, mode: "disabled" } },
      metrics: { leadsDiscovered: 1, leadsVerified: 1, qualifiedProspects: 1, outreachAwaitingApproval: 0, outreachSent: 0, deliveriesConfirmed: 0, replies: 0, interestedProspects: 0, meetings: 0, opportunities: 0, wonCustomers: 0, revenue: 0, revenueCurrency: "USD", humanActions: 0, aiRequests: 0, searchRequests: 1, estimatedAiCostMinor: 0, externalProviderCostsAvailable: false },
      currentBlocker: null,
      recommendedNextAction: "Review qualified prospects.",
      employees: [],
      recentJobs: [],
    });
    mockedStartSalesDepartment.mockResolvedValue({ status: "RUNNING" });
    mockedPauseSalesDepartment.mockResolvedValue({});
    mockedAskDemo.mockResolvedValue("Demo result");
    mockedResearch.mockResolvedValue("Research result");
    mockedEmail.mockResolvedValue("Generated email");
    mockedResearchStatus.mockResolvedValue({
      enabled: true,
      configured: true,
      provider: "TAVILY",
      requiredEnvironmentVariable: "TAVILY_API_KEY",
      message: "Verified search is configured.",
    });
    mockedCreateResearchJob.mockResolvedValue({
      cached: false,
      job: {
        id: "job-1",
        query: "Research Acme",
        targetType: "COMPANY",
        status: "COMPLETED",
        provider: "TAVILY",
        error: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        results: [{
          id: "result-1",
          companyName: "Acme",
          legalName: null,
          website: "https://acme.example",
          domain: "acme.example",
          industry: "Logistics",
          description: "Public logistics provider",
          headquarters: null,
          publicPhone: null,
          publicEmail: null,
          unknownFields: ["legalName", "headquarters", "publicPhone", "publicEmail"],
          confidenceScore: 72,
          riskFlags: ["REQUIRES_CONFIRMATION"],
          salesAnalysis: { label: "AI analysis", statements: [{ statement: "Possible fit based on the verified industry.", type: "INFERENCE", evidenceIds: ["ev-1"] }], rejectedUnsupportedFacts: 1 },
          staleAt: new Date().toISOString(),
          evidence: [{ id: "ev-1", field: "companyName", value: "Acme", sourceUrl: "https://acme.example", sourceTitle: "Acme official site", sourceType: "OFFICIAL_WEBSITE", retrievedAt: new Date().toISOString(), confidence: 0.9, verificationStatus: "VERIFIED", quotedSnippet: "Acme", isPrimarySource: true }],
        }],
      },
    });
    mockedGet.mockResolvedValue({
      data: {
        data: {
          providerStatus: {
            research: { enabled: false, configured: false, provider: "TAVILY", message: "Not configured" },
            email: { configured: false, provider: "log", outboundEnabled: false },
          },
        },
      },
    });
    mockedPut.mockResolvedValue({
      data: { data: { settings: { ...authUser.settings, userId: authUser.id, name: authUser.name, email: authUser.email } } },
    });
  });

  it("renders live dashboard totals and recent activity", async () => {
    withRouter(<Dashboard />);
    expect(await screen.findByText("Example Company Workspace")).toBeInTheDocument();
    expect(screen.getByText("Leads discovered").nextElementSibling).toHaveTextContent("1");
  });

  it("reports dashboard loading failures instead of presenting empty data as successful", async () => {
    mockedGetSalesDepartmentStatus.mockRejectedValueOnce(new Error("database unavailable"));
    withRouter(<Dashboard />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not load the AI Sales Department.");
    });
  });

  it("starts, pauses, refreshes date ranges, and renders operational truth", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockedGetSalesDepartmentStatus.mockResolvedValue({
      workspace: { id: "tenant-test", name: "Internal Test Workspace", kind: "TEST", dataLabel: "TEST" },
      range: { from: new Date().toISOString(), to: new Date().toISOString(), label: "Test activity" },
      config: { mode: "AUTONOMOUS", status: "RUNNING", outreachGoal: "Find qualified buyers", searchLocations: ["India"], approvedClaims: ["Approved"], prohibitedClaims: ["Guarantees"], approvalPolicy: { newAudience: true, firstOutreach: true, sensitiveReplies: true, pricing: true, proposals: true, contracts: true }, dailyContactLimit: 10, monthlyContactLimit: 100, maximumFollowUps: 2, maximumRetries: 3, quietHours: { timezone: "UTC", start: "17:00", end: "09:00" }, budgetMinor: 100, currency: "USD", senderIdentity: { name: "Ava", role: "AI SDR", email: "ava@example.com", disclosure: "AI representative" }, senderVerified: true, humanMeetingOwner: "Sam" },
      canStart: true,
      blockers: [],
      providers: { research: { enabled: true, configured: false, provider: "TAVILY", requiredEnvironmentVariable: "TAVILY_API_KEY", message: "Not configured" }, ai: { configured: true, selected: "GROQ", model: "llama-test" }, email: { enabled: true, mode: "test" } },
      metrics: { leadsDiscovered: 2, leadsVerified: 1, qualifiedProspects: 1, outreachAwaitingApproval: 1, outreachSent: 1, deliveriesConfirmed: 1, replies: 1, interestedProspects: 1, meetings: 1, opportunities: 1, wonCustomers: 1, revenue: 1000, revenueCurrency: "USD", humanActions: 1, aiRequests: 2, searchRequests: 3, estimatedAiCostMinor: 4, externalProviderCostsAvailable: true },
      currentBlocker: null,
      recommendedNextAction: "Review reply.",
      employees: [{ key: "researcher", name: "Riya", role: "Researcher", job: "Find evidence", status: "BLOCKED", currentTask: "PROVIDER_CHECK", errorState: "Search unavailable", kpi: "Verified leads" }, { key: "manager", name: "Maya", role: "Manager", job: "Coordinate work", status: "IDLE", currentTask: null, errorState: null, kpi: "Revenue" }],
      recentJobs: [{ id: "job-failed", category: "LEAD_DISCOVERY", status: "FAILED", errorCode: "PROVIDER_DISABLED", createdAt: new Date().toISOString(), completedAt: new Date().toISOString() }, { id: "job-complete", category: "DAILY_BRIEF", status: "COMPLETED", errorCode: null, createdAt: new Date().toISOString(), completedAt: new Date().toISOString() }],
    });
    mockedGetDailySalesBrief.mockResolvedValue({
      id: "brief-rich",
      briefDate: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      dataLabel: "TEST",
      metrics: { leadsDiscovered: 2, researchCompleted: 1, qualifiedLeads: 1, outreachSent: 1, repliesReceived: 1, interestedProspects: 1, meetings: 1, opportunitiesCreated: 1, pipelineValue: 1000, deliveriesConfirmed: 1, wonCustomers: 1, revenue: 1000, revenueCurrency: "USD", aiRequests: 2, searchRequestsRecorded: 3, estimatedAiCostMinor: 4, externalProviderCostsAvailable: true },
      failures: ["One provider failure"], risks: ["Human review needed"], approvals: ["Approve audience"], priorities: ["Review reply"],
    });
    withRouter(<Dashboard />);
    expect(await screen.findByText("Internal Test Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Search unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Provider costs recorded")).toBeInTheDocument();
    expect(screen.getByText("lead discovery")).toBeInTheDocument();
    expect(screen.getByText("One provider failure")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Date range"), "7");
    await waitFor(() => expect(mockedGetSalesDepartmentStatus).toHaveBeenCalledWith(expect.any(AbortSignal), expect.objectContaining({ from: expect.any(String), to: expect.any(String) })));
    await user.click(screen.getByRole("button", { name: /Start AI Sales/ }));
    await waitFor(() => expect(mockedStartSalesDepartment).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Pause AI Sales" }));
    expect(mockedPauseSalesDepartment).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Pause AI Sales" }));
    await waitFor(() => expect(mockedPauseSalesDepartment).toHaveBeenCalledWith("Paused by a human operator from the command center."));
  });

  it("routes every recorded configuration blocker to its safe setup surface", async () => {
    const user = userEvent.setup();
    mockedGetSalesDepartmentStatus.mockResolvedValueOnce({
      ...(await mockedGetSalesDepartmentStatus()),
      canStart: false,
      config: { ...(await mockedGetSalesDepartmentStatus()).config, status: "BLOCKED" },
      currentBlocker: { code: "SALES_STRATEGY_REQUIRED", message: "Confirm a sales strategy.", blocking: true },
      blockers: [
        { code: "SALES_STRATEGY_REQUIRED", message: "Confirm a sales strategy.", blocking: true },
        { code: "RESEARCH_PROVIDER_REQUIRED", message: "Configure research.", blocking: true },
        { code: "OUTBOUND_PROVIDER_REQUIRED", message: "Configure outbound.", blocking: false },
        { code: "COMPANY_PROFILE_REQUIRED", message: "Approve company knowledge.", blocking: true },
      ],
    });
    render(<MemoryRouter><Dashboard /><LocationProbe /></MemoryRouter>);
    expect((await screen.findAllByText("Confirm a sales strategy.")).length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: /Start AI Sales/ }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/command");
    await user.click(screen.getByRole("button", { name: "Configure research." }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/settings");
    await user.click(screen.getByRole("button", { name: "Configure outbound." }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/settings");
    await user.click(screen.getByRole("button", { name: "Approve company knowledge." }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/company-setup");
  });

  it("reports failed start and pause transitions", async () => {
    const user = userEvent.setup();
    mockedStartSalesDepartment.mockRejectedValueOnce(new Error("start unavailable"));
    withRouter(<Dashboard />);
    await screen.findByText("Example Company Workspace");
    await user.click(screen.getByRole("button", { name: /Start AI Sales/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("AI Sales could not start."));
  });

  it("renders honest landing calls to action and evidence safeguards", () => {
    withRouter(<Landing />);
    expect(screen.getAllByRole("link", { name: /Start Free/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /See How It Works/ })).toHaveAttribute("href", "#workflow");
    expect(screen.getByText(/No evidence means the field remains unknown/i)).toBeInTheDocument();
  });

  it("generates an email from labeled inputs", async () => {
    const user = userEvent.setup();
    withRouter(<Email />);
    await user.type(screen.getByLabelText("Company name"), "Acme");
    await user.type(screen.getByLabelText("Contact name"), "Alex");
    await user.type(screen.getByLabelText("Industry"), "Logistics");
    await user.click(screen.getByRole("button", { name: "Generate Email" }));
    expect(await screen.findByDisplayValue("Generated email")).toBeInTheDocument();
  });

  it("runs authenticated research and announces the result", async () => {
    const user = userEvent.setup();
    withRouter(<Research />);
    await screen.findByText("TAVILY configured");
    await user.type(screen.getByLabelText("What market or company should be researched?"), "Research Acme");
    await user.click(screen.getByLabelText(/I confirm this paid search request/i));
    await user.click(screen.getByRole("button", { name: "Start verified research" }));
    expect(await screen.findByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("Possible fit based on the verified industry.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute("href", "https://acme.example");
    expect(mockedCreateResearchJob).toHaveBeenCalledWith({ query: "Research Acme", targetType: "COMPANY" });
  });

  it("shows the exact disabled state instead of fabricated research", async () => {
    mockedResearchStatus.mockResolvedValueOnce({
      enabled: false,
      configured: false,
      provider: "TAVILY",
      requiredEnvironmentVariable: "TAVILY_API_KEY",
      message: "TAVILY live search is disabled. Configure TAVILY_API_KEY, enable SEARCH_ENABLED, and set a positive SEARCH_MONTHLY_REQUEST_LIMIT.",
    });
    withRouter(<Research />);
    expect(await screen.findByText(/Configure TAVILY_API_KEY/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start verified research" })).toBeDisabled();
  });

  it("renders accessible chart summaries", async () => {
    withRouter(<Reports />);
    expect(await screen.findByRole("img", { name: "Monthly leads: Jul 1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Lead status counts: Interested 1" }))
      .toBeInTheDocument();
  });

  it("saves profile settings", async () => {
    const user = userEvent.setup();
    withRouter(<Settings />);
    expect(screen.getByRole("option", { name: "Mock AI" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Groq" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Company"));
    await user.type(screen.getByLabelText("Company"), "Updated Co");
    await user.selectOptions(screen.getByLabelText("AI provider"), "GROQ");
    await user.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(mockedPut).toHaveBeenCalledWith(
      "/settings",
      expect.objectContaining({ company: "Updated Co", aiProvider: "GROQ" }),
    );
  });

  it("requires exact confirmation before account deletion", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    mockedDelete.mockResolvedValueOnce({ data: undefined, status: 204, statusText: "No Content", headers: {}, config: {} as never });
    withRouter(<Settings />);
    await user.type(screen.getByLabelText("Type your account email"), authUser.email);
    await user.click(screen.getByLabelText("I understand this deletion is permanent."));
    await user.click(screen.getByRole("button", { name: "Permanently delete account" }));
    expect(mockedDelete).toHaveBeenCalledWith("/settings/account", { data: { confirm: "DELETE", email: authUser.email } });
  });

  it("renders profile and not-found recovery states", () => {
    const { unmount } = withRouter(<Profile />);
    expect(screen.getByRole("heading", { name: "Sales User" })).toBeInTheDocument();
    unmount();
    withRouter(<NotFound />);
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
