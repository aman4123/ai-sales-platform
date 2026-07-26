import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import {
  createLead,
  getLeadPage,
  removeLead,
  updateLead,
} from "../services/leadStorage";
import { getReports } from "../services/reports";
import { api } from "../services/api";
import type { Lead } from "../types/lead";
import CRM from "./CRM";

vi.mock("../components/layout/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../services/leadStorage", () => ({
  getLeadPage: vi.fn(),
  createLead: vi.fn(),
  updateLead: vi.fn(),
  removeLead: vi.fn(),
}));
vi.mock("../services/reports", () => ({ getReports: vi.fn() }));
vi.mock("../services/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const firstLead: Lead = {
  id: "lead-1",
  company: "Acme Logistics",
  contact: "Alex",
  email: null,
  phone: null,
  industry: null,
  status: "INTERESTED",
  value: "1000.00",
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const secondLead: Lead = { ...firstLead, id: "lead-2", company: "Beta Manufacturing" };
const mockedGetLeadPage = vi.mocked(getLeadPage);
const mockedGetReports = vi.mocked(getReports);

describe("CRM pagination", () => {
  beforeEach(() => {
    mockedGetLeadPage.mockReset();
    mockedGetReports.mockReset();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    mockedGetReports.mockResolvedValue({
      summary: { revenue: 1000, leads: 2, meetings: 0, closedDeals: 0 },
      monthly: [],
      status: [{ name: "Interested", value: 2 }],
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { companies: [], contacts: [] } },
    } as never);
  });

  it("loads bounded pages while retaining accessible controls", async () => {
    mockedGetLeadPage
      .mockResolvedValueOnce({ leads: [firstLead], total: 2, nextCursor: "lead-1" })
      .mockResolvedValueOnce({ leads: [secondLead], total: 2, nextCursor: null });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/crm"]}>
        <CRM />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Acme Logistics")).toBeInTheDocument();
    expect(screen.getByLabelText("Search company or contact")).toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more leads" }));

    expect(await screen.findByText("Beta Manufacturing")).toBeInTheDocument();
    await waitFor(() => expect(mockedGetLeadPage).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Showing 2 of 2 matching leads")).toBeInTheDocument();
  });

  it("renders sourced records and creates an evidence-linked public contact", async () => {
    mockedGetLeadPage.mockResolvedValue({ leads: [], total: 0, nextCursor: null });
    const company = {
      id: "company-1",
      name: "Northstar Logistics",
      domain: "northstar.example",
      industry: "Logistics",
      confidenceScore: 82.4,
      riskFlags: ["SOURCE_CONFLICT"],
      _count: { contacts: 1 },
    };
    const contact = {
      id: "contact-1",
      name: "Jordan Lee",
      jobTitle: "Sales Director",
      publicEmail: "jordan@northstar.example",
      verificationStatus: "PARTIALLY_VERIFIED",
      company: { id: company.id, name: company.name },
    };
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { companies: [company], contacts: [contact] } },
    } as never);
    vi.mocked(api.post).mockResolvedValue({ data: { data: { contact } } } as never);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/crm"]}>
        <CRM />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText("Northstar Logistics")).toHaveLength(2);
    expect(screen.getByText((_, element) =>
      element?.textContent === "northstar.example · Logistics"
    )).toBeInTheDocument();
    expect(screen.getByText(/SOURCE_CONFLICT/)).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText(/jordan@northstar\.example/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Saved company"), company.id);
    await user.type(screen.getByLabelText("Contact name"), "Taylor Kim");
    await user.type(screen.getByLabelText("Public job title"), "Operations Lead");
    await user.type(screen.getByLabelText("Public professional email"), "taylor@northstar.example");
    await user.type(screen.getByLabelText("Public source URL"), "https://northstar.example/team");
    await user.click(screen.getByRole("button", { name: "Add public contact" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/crm/contacts", {
      companyId: company.id,
      name: "Taylor Kim",
      jobTitle: "Operations Lead",
      publicEmail: "taylor@northstar.example",
      publicSourceUrl: "https://northstar.example/team",
      verificationStatus: "PARTIALLY_VERIFIED",
    }));
    expect(toast.success).toHaveBeenCalledWith("Public professional contact added.");
  });

  it("validates, creates, edits, and deletes owned leads", async () => {
    mockedGetLeadPage.mockResolvedValue({ leads: [firstLead], total: 1, nextCursor: null });
    vi.mocked(createLead).mockResolvedValue(firstLead);
    vi.mocked(updateLead).mockResolvedValue(firstLead);
    vi.mocked(removeLead).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/crm"]}>
        <CRM />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Acme Logistics")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Company"), "New Company");
    await user.type(screen.getByLabelText("Contact"), "New Contact");
    await user.type(screen.getByLabelText("Deal value"), "-1");
    await user.click(screen.getByRole("button", { name: "+ Add Lead" }));
    expect(toast.error).toHaveBeenCalledWith(
      "Enter a company, contact, and valid non-negative deal value.",
    );

    await user.clear(screen.getByLabelText("Deal value"));
    await user.type(screen.getByLabelText("Deal value"), "2500");
    await user.click(screen.getByRole("button", { name: "+ Add Lead" }));
    await waitFor(() => expect(createLead).toHaveBeenCalledWith({
      company: "New Company",
      contact: "New Contact",
      status: "INTERESTED",
      value: 2500,
    }));

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(scrollIntoView).toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Filter by status"), "MEETING");
    await user.selectOptions(screen.getByLabelText("Status"), "MEETING");
    await user.click(screen.getByRole("button", { name: "Update Lead" }));
    await waitFor(() => expect(updateLead).toHaveBeenCalledWith(firstLead.id, expect.objectContaining({
      status: "MEETING",
    })));

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteButton);
    expect(removeLead).not.toHaveBeenCalled();
    await user.click(deleteButton);
    await waitFor(() => expect(removeLead).toHaveBeenCalledWith(firstLead.id));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
