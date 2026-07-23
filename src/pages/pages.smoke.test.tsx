import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../contexts/auth-context";
import { generateEmailWithAI, researchWithAI, askDemoAI } from "../services/ai";
import { api } from "../services/api";
import { getLeadPage } from "../services/leadStorage";
import { getReports } from "../services/reports";
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
vi.mock("../services/api", () => ({
  api: { put: vi.fn() },
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
const mockedPut = vi.mocked(api.put);

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
    mockedPut.mockResolvedValue({
      data: { data: { settings: { ...authUser.settings, userId: authUser.id, name: authUser.name, email: authUser.email } } },
    });
  });

  it("renders live dashboard totals and recent activity", async () => {
    withRouter(<Dashboard />);
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Total Leads").nextElementSibling).toHaveTextContent("1");
  });

  it("submits the public AI demo as an accessible form", async () => {
    const user = userEvent.setup();
    withRouter(<Landing />);
    await user.type(screen.getByLabelText("Ask the AI sales demo"), "Research Acme");
    await user.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(await screen.findByText("Demo result")).toBeInTheDocument();
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
    await user.type(screen.getByLabelText("Research request"), "Research Acme");
    await user.click(screen.getByRole("button", { name: /Research$/ }));
    expect(await screen.findByText("Research result")).toBeInTheDocument();
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
    await user.clear(screen.getByLabelText("Company"));
    await user.type(screen.getByLabelText("Company"), "Updated Co");
    await user.click(screen.getByRole("button", { name: /Save Settings/ }));
    expect(mockedPut).toHaveBeenCalledWith(
      "/settings",
      expect.objectContaining({ company: "Updated Co" }),
    );
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
