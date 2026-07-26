-- Release-candidate invariants that complement application-level validation.
ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_score_range_check" CHECK ("score" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Lead_evidenceQuality_range_check" CHECK ("evidenceQuality" BETWEEN 0 AND 1),
  ADD CONSTRAINT "Lead_confidence_range_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_confidenceScore_range_check" CHECK ("confidenceScore" BETWEEN 0 AND 100);

ALTER TABLE "CompanyResearchResult"
  ADD CONSTRAINT "CompanyResearchResult_confidenceScore_range_check" CHECK ("confidenceScore" BETWEEN 0 AND 100);

ALTER TABLE "EvidenceItem"
  ADD CONSTRAINT "EvidenceItem_confidence_range_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "ResearchJob"
  ADD CONSTRAINT "ResearchJob_attempt_bounds_check"
  CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 10 AND "attemptCount" <= "maxAttempts");

ALTER TABLE "SearchUsage"
  ADD CONSTRAINT "SearchUsage_count_nonnegative_check" CHECK ("count" >= 0);

ALTER TABLE "Campaign"
  ADD CONSTRAINT "Campaign_dailySendingLimit_positive_check" CHECK ("dailySendingLimit" > 0),
  ADD CONSTRAINT "Campaign_version_bounds_check"
  CHECK ("contentVersion" >= 1 AND ("approvedVersion" IS NULL OR "approvedVersion" <= "contentVersion"));

ALTER TABLE "CampaignRecipient"
  ADD CONSTRAINT "CampaignRecipient_target_required_check"
  CHECK (num_nonnulls("leadId", "contactId") = 1);

ALTER TABLE "CampaignMessage"
  ADD CONSTRAINT "CampaignMessage_attempt_bounds_check"
  CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 10 AND "attemptCount" <= "maxAttempts"),
  ADD CONSTRAINT "CampaignMessage_version_positive_check" CHECK ("contentVersion" >= 1),
  ADD CONSTRAINT "CampaignMessage_sequenceStep_nonnegative_check" CHECK ("sequenceStep" >= 0);

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_public_data_source_check"
  CHECK (
    ("publicEmail" IS NULL AND "publicPhone" IS NULL AND "linkedInUrl" IS NULL)
    OR "publicSourceUrl" IS NOT NULL
  );

CREATE FUNCTION prevent_campaign_approval_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Campaign approval snapshots are immutable';
END;
$$;

CREATE TRIGGER "CampaignApproval_immutable_update"
BEFORE UPDATE ON "CampaignApproval"
FOR EACH ROW EXECUTE FUNCTION prevent_campaign_approval_update();
