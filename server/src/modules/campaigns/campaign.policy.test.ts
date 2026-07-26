import { describe, expect, it } from "vitest";
import { automationStopReason, canQueueCampaign, canSendCampaign, hasCurrentApproval } from "./campaign.policy.js";

describe("campaign approval and automation policy", () => {
  const approved = { status: "APPROVED", contentVersion: 3, approvedVersion: 3, latestApprovalVersion: 3 };

  it("prevents queueing or sending without an immutable current approval", () => {
    expect(canQueueCampaign(approved)).toBe(true);
    expect(canQueueCampaign({ ...approved, latestApprovalVersion: null })).toBe(false);
    expect(canSendCampaign({ ...approved, status: "SCHEDULED" })).toBe(true);
    expect(canSendCampaign({ ...approved, status: "DRAFT" })).toBe(false);
  });

  it("invalidates approval whenever content version changes", () => {
    expect(hasCurrentApproval(approved)).toBe(true);
    expect(hasCurrentApproval({ ...approved, contentVersion: 4 })).toBe(false);
  });

  it.each([
    [{ replied: true }, "RECIPIENT_REPLIED"],
    [{ optedOut: true }, "RECIPIENT_OPTED_OUT"],
    [{ permanentlyFailed: true }, "PERMANENT_DELIVERY_FAILURE"],
    [{ complaint: true }, "RECIPIENT_COMPLAINT"],
    [{ confidence: 0.2 }, "LOW_CONFIDENCE"],
    [{ campaignStatus: "PAUSED" }, "CAMPAIGN_PAUSED"],
    [{ limitReached: true }, "DAILY_LIMIT_REACHED"],
  ])("stops bounded automation for %o", (override, expected) => {
    expect(automationStopReason({
      replied: false,
      optedOut: false,
      permanentlyFailed: false,
      complaint: false,
      confidence: 1,
      campaignStatus: "RUNNING",
      limitReached: false,
      ...override,
    })).toBe(expected);
  });
});
