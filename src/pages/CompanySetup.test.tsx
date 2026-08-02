import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import {
  approveCompanyProfile,
  getCompanyProfile,
  getSalesDepartmentStatus,
  updateCompanyProfile,
  updateSalesDepartmentConfig,
  type CompanyProfile,
  type SalesDepartmentStatus,
} from "../services/v2";
import CompanySetup from "./CompanySetup";

vi.mock("../components/layout/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../services/v2", () => ({
  approveCompanyProfile: vi.fn(),
  getCompanyProfile: vi.fn(),
  getSalesDepartmentStatus: vi.fn(),
  updateCompanyProfile: vi.fn(),
  updateSalesDepartmentConfig: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const profile: CompanyProfile = {
  id: "profile-1",
  tenantId: "tenant-1",
  status: "DRAFT",
  version: 2,
  companyName: "Example Co",
  website: "https://example.com",
  industry: "Software",
  description: "Evidence-backed sales software.",
  products: ["Platform"],
  services: ["Implementation"],
  useCases: ["Prospecting"],
  pricingSummary: "Public plans only",
  targetIndustries: ["Logistics"],
  targetCompanySizes: ["50-500"],
  targetJobTitles: ["Revenue leader"],
  targetLocations: ["India"],
  exclusions: ["Suppressed recipients"],
  valuePropositions: ["Evidence-backed research"],
  competitors: ["Legacy suites"],
  caseStudies: [],
  testimonials: [],
  faqs: [{ question: "Is this verified?", answer: "Evidence is retained." }],
  commonObjections: [{ objection: "Too early", approvedResponse: "We can follow up later." }],
  knowledgeSources: [{ title: "Official site", url: "https://example.com", type: "WEBSITE" }],
  preferredTone: "Professional",
  complianceRequirements: ["Honor opt-outs"],
  contactDetails: { email: "sales@example.com", phone: "+1 555 0100", address: "1 Main Street" },
  meetingPreferences: { timezone: "UTC", schedulingUrl: "https://example.com/meet", assignedCloser: "Sam" },
  approvedAt: null,
  updatedAt: new Date().toISOString(),
};

const status: SalesDepartmentStatus = {
  workspace: { id: "tenant-1", name: "Example Co", kind: "CUSTOMER", dataLabel: "REAL" },
  range: { from: new Date().toISOString(), to: new Date().toISOString(), label: "Recorded activity" },
  config: {
    mode: "ASSISTED",
    status: "READY",
    outreachGoal: "Reach logistics leaders",
    searchLocations: ["India"],
    approvedClaims: ["Evidence retained"],
    prohibitedClaims: ["Guaranteed outcomes"],
    approvalPolicy: { newAudience: true, firstOutreach: true, sensitiveReplies: true, pricing: true, proposals: true, contracts: true },
    dailyContactLimit: 10,
    monthlyContactLimit: 100,
    maximumFollowUps: 2,
    maximumRetries: 3,
    quietHours: { timezone: "UTC", start: "17:00", end: "09:00" },
    budgetMinor: 1000,
    currency: "USD",
    senderIdentity: { name: "Ava", role: "AI Sales Representative", email: "ava@example.com", disclosure: "AI representative working with the sales team." },
    senderVerified: false,
    humanMeetingOwner: "Sam",
  },
  canStart: true,
  blockers: [],
  providers: {
    research: { enabled: true, configured: true, provider: "TAVILY", requiredEnvironmentVariable: "TAVILY_API_KEY", message: "Configured" },
    ai: { configured: true, selected: "GROQ", model: "test" },
    email: { enabled: false, mode: "disabled" },
  },
  metrics: { leadsDiscovered: 0, leadsVerified: 0, qualifiedProspects: 0, outreachAwaitingApproval: 0, outreachSent: 0, deliveriesConfirmed: 0, replies: 0, interestedProspects: 0, meetings: 0, opportunities: 0, wonCustomers: 0, revenue: 0, revenueCurrency: "USD", humanActions: 0, aiRequests: 0, searchRequests: 0, estimatedAiCostMinor: 0, externalProviderCostsAvailable: false },
  currentBlocker: null,
  recommendedNextAction: "Start bounded discovery.",
  employees: [],
  recentJobs: [],
};

function renderPage() {
  return render(<MemoryRouter><CompanySetup /></MemoryRouter>);
}

describe("Company Setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCompanyProfile).mockResolvedValue(profile);
    vi.mocked(getSalesDepartmentStatus).mockResolvedValue(status);
    vi.mocked(updateCompanyProfile).mockImplementation(async (input) => ({ ...profile, ...input, version: 3 }));
    vi.mocked(updateSalesDepartmentConfig).mockResolvedValue(status.config);
    vi.mocked(approveCompanyProfile).mockResolvedValue({ ...profile, status: "APPROVED", version: 3, approvedAt: new Date().toISOString() });
  });

  it("edits, saves, configures, and approves grounded company knowledge", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "Company Setup" })).toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Updated Co" } });
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "https://updated.example" } });
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: "Logistics software" } });
    fireEvent.change(screen.getByLabelText("Preferred communication tone"), { target: { value: "Consultative" } });
    fireEvent.change(screen.getByLabelText("Company description"), { target: { value: "Updated description" } });
    fireEvent.change(screen.getByLabelText(/^Products/), { target: { value: "Platform\nInsights" } });
    fireEvent.change(screen.getByLabelText(/^Services/), { target: { value: "Implementation\nSupport" } });
    fireEvent.change(screen.getByLabelText(/^Use cases/), { target: { value: "Prospecting\nQualification" } });
    fireEvent.change(screen.getByLabelText(/^Value propositions/), { target: { value: "Grounded\nBounded" } });
    fireEvent.change(screen.getByLabelText(/^Pricing guidance/), { target: { value: "Approved public pricing" } });
    fireEvent.change(screen.getByLabelText(/^Target industries/), { target: { value: "Logistics\nManufacturing" } });
    fireEvent.change(screen.getByLabelText(/^Target company sizes/), { target: { value: "50-500" } });
    fireEvent.change(screen.getByLabelText(/^Target job titles/), { target: { value: "CRO" } });
    fireEvent.change(screen.getByLabelText(/^Target locations/), { target: { value: "India" } });
    fireEvent.change(screen.getByLabelText(/^Competitors/), { target: { value: "Suite A" } });
    fireEvent.change(screen.getByLabelText(/^Never target \/ exclusions/), { target: { value: "Competitors" } });
    fireEvent.change(screen.getByLabelText(/^FAQs/), { target: { value: "Is it safe? | Yes\ninvalid" } });
    fireEvent.change(screen.getByLabelText(/^Common objections/), { target: { value: "Too early | Follow up later" } });
    fireEvent.change(screen.getByLabelText(/^Knowledge source URLs/), { target: { value: "Docs | https://updated.example/docs | DOCUMENT\nFallback | https://updated.example/fallback | INVALID" } });
    fireEvent.change(screen.getByLabelText(/^Compliance requirements/), { target: { value: "Honor opt-outs" } });
    fireEvent.change(screen.getByLabelText("Contact email"), { target: { value: "owner@updated.example" } });
    fireEvent.change(screen.getByLabelText("Contact phone"), { target: { value: "+91 555 0100" } });
    fireEvent.change(screen.getByLabelText("Scheduling URL"), { target: { value: "https://updated.example/meet" } });
    fireEvent.change(screen.getByLabelText("Assigned human closer"), { target: { value: "Priya" } });
    fireEvent.change(screen.getByLabelText("Meeting timezone"), { target: { value: "Asia/Kolkata" } });
    fireEvent.change(screen.getByLabelText("Business address"), { target: { value: "Bengaluru" } });

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(updateCompanyProfile).toHaveBeenCalledWith(expect.objectContaining({
      companyName: "Updated Co",
      products: ["Platform", "Insights"],
      faqs: [{ question: "Is it safe?", answer: "Yes" }],
      knowledgeSources: expect.arrayContaining([
        { title: "Docs", url: "https://updated.example/docs", type: "DOCUMENT" },
        { title: "Fallback", url: "https://updated.example/fallback", type: "OTHER" },
      ]),
    })));
    expect(screen.getByText("Version 3")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Autonomy mode"), { target: { value: "AUTONOMOUS" } });
    fireEvent.change(screen.getByLabelText("Human meeting owner"), { target: { value: "Priya" } });
    fireEvent.change(screen.getByLabelText("Outreach goal"), { target: { value: "Find qualified logistics buyers" } });
    fireEvent.change(screen.getByLabelText(/^Where should the AI search\?/), { target: { value: "India\nSingapore" } });
    fireEvent.change(screen.getByLabelText(/^Claims the AI may make/), { target: { value: "Evidence is retained" } });
    fireEvent.change(screen.getByLabelText(/^Prohibited claims/), { target: { value: "Guaranteed results" } });
    fireEvent.change(screen.getByLabelText("Daily contacts"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Monthly contacts"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Maximum follow-ups"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Maximum retries"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "Maya" } });
    fireEvent.change(screen.getByLabelText("Sender role"), { target: { value: "AI SDR" } });
    fireEvent.change(screen.getByLabelText("Authorized sender email"), { target: { value: "maya@updated.example" } });
    fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Asia/Kolkata" } });
    fireEvent.change(screen.getByLabelText("AI disclosure"), { target: { value: "AI representative for Updated Co." } });
    await user.click(screen.getByLabelText("Require approval: pricing"));
    await user.click(screen.getByRole("button", { name: "Save department controls" }));
    await waitFor(() => expect(updateSalesDepartmentConfig).toHaveBeenCalledWith(expect.objectContaining({
      mode: "AUTONOMOUS",
      dailyContactLimit: 15,
      approvalPolicy: expect.objectContaining({ pricing: false }),
      senderIdentity: expect.objectContaining({ email: "maya@updated.example" }),
    })));

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Approve for AI use" }));
    expect(await screen.findByText("Approved for AI use")).toBeInTheDocument();
    expect(approveCompanyProfile).toHaveBeenCalledOnce();
  });

  it("reports load and mutation failures without pretending success", async () => {
    vi.mocked(getCompanyProfile).mockRejectedValueOnce(new Error("offline"));
    const failed = renderPage();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("offline"));
    failed.unmount();

    vi.mocked(getCompanyProfile).mockResolvedValueOnce({ ...profile, website: null, industry: null, description: null, pricingSummary: null, products: [], searchLocations: undefined } as never);
    vi.mocked(getSalesDepartmentStatus).mockResolvedValueOnce({
      ...status,
      config: { ...status.config, outreachGoal: "", searchLocations: [], approvedClaims: [], humanMeetingOwner: "" },
    });
    vi.mocked(updateCompanyProfile).mockRejectedValueOnce(new Error("save failed"));
    vi.mocked(updateSalesDepartmentConfig).mockRejectedValueOnce(new Error("controls failed"));
    vi.mocked(approveCompanyProfile).mockRejectedValueOnce(new Error("approval failed"));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Company Setup" });

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("save failed"));
    await user.click(screen.getByRole("button", { name: "Save department controls" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("controls failed"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Approve for AI use" }));
    expect(approveCompanyProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Approve for AI use" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("approval failed"));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
