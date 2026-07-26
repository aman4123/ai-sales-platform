export interface CampaignApprovalState {
  status: string;
  contentVersion: number;
  approvedVersion: number | null;
  latestApprovalVersion?: number | null;
}

export function hasCurrentApproval(campaign: CampaignApprovalState) {
  return campaign.approvedVersion === campaign.contentVersion
    && campaign.latestApprovalVersion === campaign.contentVersion;
}

export function canQueueCampaign(campaign: CampaignApprovalState) {
  return campaign.status === "APPROVED" && hasCurrentApproval(campaign);
}

export function canSendCampaign(campaign: CampaignApprovalState) {
  return ["SCHEDULED", "RUNNING"].includes(campaign.status) && hasCurrentApproval(campaign);
}

export function automationStopReason(input: {
  replied: boolean;
  optedOut: boolean;
  permanentlyFailed: boolean;
  complaint: boolean;
  confidence?: number | null | undefined;
  campaignStatus: string;
  limitReached: boolean;
}) {
  if (input.replied) return "RECIPIENT_REPLIED";
  if (input.optedOut) return "RECIPIENT_OPTED_OUT";
  if (input.permanentlyFailed) return "PERMANENT_DELIVERY_FAILURE";
  if (input.complaint) return "RECIPIENT_COMPLAINT";
  if (input.confidence != null && input.confidence < 0.5) return "LOW_CONFIDENCE";
  if (input.campaignStatus === "PAUSED") return "CAMPAIGN_PAUSED";
  if (input.limitReached) return "DAILY_LIMIT_REACHED";
  return null;
}
