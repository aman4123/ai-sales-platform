import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLeadPage } from "../services/leadStorage";
import { getReports } from "../services/reports";
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
    mockedGetReports.mockResolvedValue({
      summary: { revenue: 1000, leads: 2, meetings: 0, closedDeals: 0 },
      monthly: [],
      status: [{ name: "Interested", value: 2 }],
    });
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
});
