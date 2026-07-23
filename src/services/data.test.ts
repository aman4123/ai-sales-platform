import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lead } from "../types/lead";
import { askDemoAI, generateEmailWithAI, researchWithAI } from "./ai";
import { api } from "./api";
import { createLead, getLeadPage, removeLead, updateLead } from "./leadStorage";
import { getReports } from "./reports";

const lead: Lead = {
  id: "lead-1",
  company: "Acme",
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

describe("typed data services", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(api);
  });

  afterEach(() => mock.restore());

  it("passes bounded lead query parameters and maps CRUD envelopes", async () => {
    mock.onGet("/leads").reply((config) => [
      200,
      { data: { leads: [lead], total: 1, nextCursor: null, received: config.params } },
    ]);
    mock.onPost("/leads").reply(201, { data: { lead } });
    mock.onPut("/leads/lead-1").reply(200, { data: { lead: { ...lead, company: "Updated" } } });
    mock.onDelete("/leads/lead-1").reply(204);

    const page = await getLeadPage({ search: "Acme", status: "INTERESTED", limit: 25 });
    expect(page.leads).toEqual([lead]);
    expect(mock.history.get[0]?.params).toMatchObject({ search: "Acme", limit: 25 });
    await expect(createLead({ company: "Acme", contact: "Alex", status: "INTERESTED", value: 1000 }))
      .resolves.toEqual(lead);
    await expect(updateLead("lead-1", { company: "Updated", contact: "Alex", status: "INTERESTED", value: 1000 }))
      .resolves.toMatchObject({ company: "Updated" });
    await expect(removeLead("lead-1")).resolves.toBeUndefined();
  });

  it("maps reports and each AI endpoint", async () => {
    const reports = {
      summary: { revenue: 0, leads: 0, meetings: 0, closedDeals: 0 },
      monthly: [],
      status: [],
    };
    mock.onGet("/reports/summary").reply(200, { data: reports });
    mock.onPost("/ai/demo").reply(200, { data: { result: "Demo" } });
    mock.onPost("/ai/research").reply(200, { data: { result: "Research" } });
    mock.onPost("/ai/email").reply(200, { data: { result: "Email" } });

    await expect(getReports()).resolves.toEqual(reports);
    await expect(askDemoAI("prompt")).resolves.toBe("Demo");
    await expect(researchWithAI("prompt")).resolves.toBe("Research");
    await expect(generateEmailWithAI({
      company: "Acme",
      contact: "Alex",
      industry: "Logistics",
      tone: "Professional",
    })).resolves.toBe("Email");
  });
});
