import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/auth-context";
import { generateEmailWithAI, researchWithAI, askDemoAI } from "../services/ai";
import { api } from "../services/api";
import { getLeadPage } from "../services/leadStorage";
import { getReports } from "../services/reports";
import { createResearchJob, getResearchStatus } from "../services/v2";
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
  getResearchStatus: vi.fn(),
  saveResearchCompany: vi.fn(),
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
const mockedPut = vi.mocked(api.put);
const mockedGet = vi.mocked(api.get);
const mockedDelete = vi.mocked(api.delete);

function withRouter(component: React.ReactNode) {
  return render(<MemoryRouter>{component}</MemoryRouter>);
}

describe("primary application pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: authUser,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      acceptSession: vi.fn(),
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
    mockedAskDemo.mockResolvedValue("Demo result");
    mockedResearch.mockResolvedValue("Research result");
    mockedEmail.mockResolvedValue("Generated email");
    mockedResearchStatus.mockResolvedValue({
      enabled: true,
      configured: true,
      provider: "TAVILY",
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
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Total Leads").nextElementSibling).toHaveTextContent("1");
  });

  it("reports dashboard loading failures instead of presenting empty data as successful", async () => {
    mockedGetLeadPage.mockRejectedValueOnce(new Error("database unavailable"));
    withRouter(<Dashboard />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not load the dashboard.");
    });
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
      message: "Live search is not configured. Verified company research is unavailable.",
    });
    withRouter(<Research />);
    expect(await screen.findByText("Live search is not configured. Verified company research is unavailable.")).toBeInTheDocument();
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
