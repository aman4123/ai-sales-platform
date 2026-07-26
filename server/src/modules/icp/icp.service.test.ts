import { describe, expect, it } from "vitest";
import { buildIdealCustomerProfile, scoreLead } from "./icp.service.js";

describe("ICP and explainable lead scoring", () => {
  it("labels pain points as requiring confirmation", () => {
    const profile = buildIdealCustomerProfile({
      productService: "Sales platform",
      targetIndustry: "Logistics",
      geography: "India",
      painPoints: ["Manual prospecting"],
      exclusions: ["Consumer-only businesses"],
      campaignGoal: "Find possible-fit companies",
    });
    expect(profile.fitCriteria.opportunitySignals).toEqual(["Manual prospecting (requires confirmation)"]);
    expect(profile.summary).toMatch(/possible-fit/i);
  });

  it("clamps inputs, applies risk penalties, and explains every score", () => {
    const result = scoreLead({
      industryFit: 2,
      locationFit: 1,
      companySizeFit: 1,
      evidenceQuality: 1,
      websiteAvailable: true,
      publicContactAvailable: true,
      productRelevance: 1,
      dataFreshness: 1,
      confidence: 1,
      riskFlags: ["CONFLICT", "STALE"],
    });
    expect(result.score).toBe(90);
    expect(result.label).toBe("Possible fit");
    expect(result.reasons.at(-1)).toMatchObject({ criterion: "Risk flags", points: -10 });
  });
});
