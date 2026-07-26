-- V2 is additive: existing users, leads, sessions, and AI history are preserved.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'USER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';


CREATE TYPE "ResearchTargetType" AS ENUM ('COMPANY', 'MARKET', 'CONTACT');
CREATE TYPE "ResearchJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'CONFLICTING', 'NOT_PUBLICLY_AVAILABLE');
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL_WEBSITE', 'GOVERNMENT_REGISTRY', 'COMPANY_PROFILE', 'NEWS', 'BUSINESS_DIRECTORY', 'SOCIAL_PROFILE', 'USER_PROVIDED', 'OTHER');
CREATE TYPE "SearchProviderType" AS ENUM ('TAVILY', 'BRAVE', 'SERPER');
CREATE TYPE "DealStage" AS ENUM ('QUALIFYING', 'DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'RESEARCHING', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'APPROVED', 'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'REPLIED', 'OPTED_OUT', 'FAILED', 'CANCELLED');
CREATE TYPE "CampaignMessageStatus" AS ENUM ('DRAFT', 'APPROVED', 'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'CANCELLED');
CREATE TYPE "CampaignMessageKind" AS ENUM ('INITIAL', 'FOLLOW_UP_1', 'FOLLOW_UP_2', 'FINAL_FOLLOW_UP');
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TaskType" AS ENUM ('HUMAN_RESPONSE_REQUIRED', 'REVIEW_RESEARCH', 'REVIEW_CAMPAIGN', 'DATA_CONFLICT', 'GENERAL');
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ARCHIVED');
CREATE TYPE "DeliveryEventType" AS ENUM ('DELIVERED', 'BOUNCED', 'COMPLAINT', 'UNSUBSCRIBED', 'REPLIED');

ALTER TABLE "Lead"
  ADD COLUMN "companyRecordId" TEXT,
  ADD COLUMN "contactRecordId" TEXT,
  ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scoreReasons" JSONB,
  ADD COLUMN "evidenceQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lastResearchedAt" TIMESTAMP(3);

ALTER TABLE "UserSettings"
  ADD COLUMN "organization" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "dataRetentionDays" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "campaignDailyLimit" INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN "unsubscribeFooter" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "senderName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "senderEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "notificationPreferences" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "campaignDefaults" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "privacyMode" TEXT NOT NULL DEFAULT 'STANDARD';

CREATE TABLE "IdealCustomerProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "productService" TEXT NOT NULL,
  "targetIndustry" TEXT NOT NULL,
  "geography" TEXT NOT NULL,
  "companySize" TEXT,
  "painPoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferredBuyerRole" TEXT,
  "exclusions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "campaignGoal" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "fitCriteria" JSONB NOT NULL,
  "exclusionCriteria" JSONB NOT NULL,
  "searchQueries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scoringModel" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IdealCustomerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesGoal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "targetMarket" JSONB NOT NULL,
  "plan" JSONB NOT NULL,
  "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "website" TEXT,
  "domain" TEXT,
  "industry" TEXT,
  "description" TEXT,
  "headquarters" TEXT,
  "operatingLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "publicPhone" TEXT,
  "publicEmail" TEXT,
  "socialProfiles" JSONB,
  "registrationIdentifiers" JSONB,
  "productsServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "staleAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "name" TEXT NOT NULL,
  "jobTitle" TEXT,
  "publicEmail" TEXT,
  "publicPhone" TEXT,
  "linkedInUrl" TEXT,
  "publicSourceUrl" TEXT,
  "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "optedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Deal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "contactId" TEXT,
  "name" TEXT NOT NULL,
  "stage" "DealStage" NOT NULL DEFAULT 'QUALIFYING',
  "value" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "expectedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "contactId" TEXT,
  "dealId" TEXT,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Note" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "leadId" TEXT,
  "companyId" TEXT,
  "contactId" TEXT,
  "dealId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "targetType" "ResearchTargetType" NOT NULL,
  "status" "ResearchJobStatus" NOT NULL DEFAULT 'PENDING',
  "provider" "SearchProviderType",
  "errorCode" TEXT,
  "error" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "timeoutAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyResearchResult" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "companyId" TEXT,
  "companyName" TEXT,
  "legalName" TEXT,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "website" TEXT,
  "domain" TEXT,
  "industry" TEXT,
  "description" TEXT,
  "headquarters" TEXT,
  "operatingLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "publicPhone" TEXT,
  "publicEmail" TEXT,
  "socialProfiles" JSONB,
  "registrationIdentifiers" JSONB,
  "productsServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "unknownFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "salesAnalysis" JSONB,
  "staleAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyResearchResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceItem" (
  "id" TEXT NOT NULL,
  "researchResultId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceTitle" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "retrievedAt" TIMESTAMP(3) NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "verificationStatus" "VerificationStatus" NOT NULL,
  "quotedSnippet" TEXT,
  "isPrimarySource" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "SearchProviderType" NOT NULL,
  "month" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SearchUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idealCustomerProfileId" TEXT,
  "name" TEXT NOT NULL,
  "salesGoal" TEXT NOT NULL,
  "productService" TEXT NOT NULL,
  "valueProposition" TEXT NOT NULL,
  "audienceFilters" JSONB NOT NULL,
  "senderIdentity" JSONB NOT NULL,
  "emailTemplate" JSONB,
  "sequenceConfig" JSONB NOT NULL,
  "schedule" JSONB NOT NULL,
  "dailySendingLimit" INTEGER NOT NULL DEFAULT 25,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "contentVersion" INTEGER NOT NULL DEFAULT 1,
  "approvedVersion" INTEGER,
  "pausedAt" TIMESTAMP(3),
  "launchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "leadId" TEXT,
  "companyId" TEXT,
  "contactId" TEXT,
  "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "stopReason" TEXT,
  "repliedAt" TIMESTAMP(3),
  "optedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignMessage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "kind" "CampaignMessageKind" NOT NULL,
  "sequenceStep" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "greeting" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "cta" TEXT NOT NULL,
  "closing" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "factsUsed" JSONB NOT NULL,
  "evidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "promptVersion" TEXT NOT NULL,
  "contentVersion" INTEGER NOT NULL,
  "status" "CampaignMessageStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "failureReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastAttemptAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignApproval" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL,
  "approvalType" TEXT NOT NULL,
  "contentVersion" INTEGER NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "messageSnapshot" JSONB NOT NULL,
  "sequenceSnapshot" JSONB NOT NULL,
  "limitsSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reply" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "messageId" TEXT,
  "providerReplyId" TEXT,
  "classification" TEXT,
  "contentPreview" TEXT,
  "requiresHuman" BOOLEAN NOT NULL DEFAULT true,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OptOut" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "reason" TEXT,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptOut_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "type" "DeliveryEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT,
  "type" "TaskType" NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata" JSONB,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_userId_domain_key" ON "Company"("userId", "domain");
CREATE INDEX "Company_userId_name_idx" ON "Company"("userId", "name");
CREATE INDEX "Company_userId_deletedAt_idx" ON "Company"("userId", "deletedAt");
CREATE UNIQUE INDEX "Contact_userId_publicEmail_key" ON "Contact"("userId", "publicEmail");
CREATE INDEX "Contact_userId_name_idx" ON "Contact"("userId", "name");
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");
CREATE INDEX "Contact_userId_deletedAt_idx" ON "Contact"("userId", "deletedAt");
CREATE INDEX "Deal_userId_stage_idx" ON "Deal"("userId", "stage");
CREATE INDEX "Deal_companyId_idx" ON "Deal"("companyId");
CREATE INDEX "Deal_contactId_idx" ON "Deal"("contactId");
CREATE INDEX "CrmActivity_userId_occurredAt_idx" ON "CrmActivity"("userId", "occurredAt");
CREATE INDEX "CrmActivity_companyId_idx" ON "CrmActivity"("companyId");
CREATE INDEX "CrmActivity_contactId_idx" ON "CrmActivity"("contactId");
CREATE INDEX "CrmActivity_dealId_idx" ON "CrmActivity"("dealId");
CREATE INDEX "Note_userId_createdAt_idx" ON "Note"("userId", "createdAt");
CREATE INDEX "Note_leadId_idx" ON "Note"("leadId");
CREATE INDEX "Note_companyId_idx" ON "Note"("companyId");
CREATE INDEX "Note_contactId_idx" ON "Note"("contactId");
CREATE INDEX "Note_dealId_idx" ON "Note"("dealId");
CREATE INDEX "IdealCustomerProfile_userId_createdAt_idx" ON "IdealCustomerProfile"("userId", "createdAt");
CREATE INDEX "IdealCustomerProfile_userId_deletedAt_idx" ON "IdealCustomerProfile"("userId", "deletedAt");
CREATE INDEX "SalesGoal_userId_status_createdAt_idx" ON "SalesGoal"("userId", "status", "createdAt");
CREATE INDEX "ResearchJob_userId_createdAt_idx" ON "ResearchJob"("userId", "createdAt");
CREATE INDEX "ResearchJob_userId_status_idx" ON "ResearchJob"("userId", "status");
CREATE INDEX "CompanyResearchResult_userId_createdAt_idx" ON "CompanyResearchResult"("userId", "createdAt");
CREATE INDEX "CompanyResearchResult_jobId_idx" ON "CompanyResearchResult"("jobId");
CREATE INDEX "CompanyResearchResult_companyId_idx" ON "CompanyResearchResult"("companyId");
CREATE INDEX "CompanyResearchResult_userId_domain_idx" ON "CompanyResearchResult"("userId", "domain");
CREATE INDEX "EvidenceItem_researchResultId_field_idx" ON "EvidenceItem"("researchResultId", "field");
CREATE INDEX "EvidenceItem_sourceUrl_idx" ON "EvidenceItem"("sourceUrl");
CREATE UNIQUE INDEX "SearchUsage_userId_provider_month_key" ON "SearchUsage"("userId", "provider", "month");
CREATE INDEX "SearchUsage_provider_month_idx" ON "SearchUsage"("provider", "month");
CREATE INDEX "Campaign_userId_status_idx" ON "Campaign"("userId", "status");
CREATE INDEX "Campaign_userId_createdAt_idx" ON "Campaign"("userId", "createdAt");
CREATE INDEX "Campaign_idealCustomerProfileId_idx" ON "Campaign"("idealCustomerProfileId");
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_leadId_key" ON "CampaignRecipient"("campaignId", "leadId");
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_contactId_key" ON "CampaignRecipient"("campaignId", "contactId");
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");
CREATE INDEX "CampaignRecipient_companyId_idx" ON "CampaignRecipient"("companyId");
CREATE UNIQUE INDEX "CampaignMessage_idempotencyKey_key" ON "CampaignMessage"("idempotencyKey");
CREATE UNIQUE INDEX "CampaignMessage_recipientId_sequenceStep_contentVersion_key" ON "CampaignMessage"("recipientId", "sequenceStep", "contentVersion");
CREATE INDEX "CampaignMessage_userId_status_scheduledAt_idx" ON "CampaignMessage"("userId", "status", "scheduledAt");
CREATE INDEX "CampaignMessage_campaignId_status_idx" ON "CampaignMessage"("campaignId", "status");
CREATE INDEX "CampaignApproval_campaignId_contentVersion_idx" ON "CampaignApproval"("campaignId", "contentVersion");
CREATE INDEX "CampaignApproval_approvedById_createdAt_idx" ON "CampaignApproval"("approvedById", "createdAt");
CREATE UNIQUE INDEX "Reply_userId_providerReplyId_key" ON "Reply"("userId", "providerReplyId");
CREATE INDEX "Reply_recipientId_receivedAt_idx" ON "Reply"("recipientId", "receivedAt");
CREATE INDEX "Reply_userId_requiresHuman_idx" ON "Reply"("userId", "requiresHuman");
CREATE UNIQUE INDEX "OptOut_userId_emailHash_key" ON "OptOut"("userId", "emailHash");
CREATE INDEX "OptOut_userId_createdAt_idx" ON "OptOut"("userId", "createdAt");
CREATE UNIQUE INDEX "DeliveryEvent_provider_providerEventId_key" ON "DeliveryEvent"("provider", "providerEventId");
CREATE INDEX "DeliveryEvent_messageId_occurredAt_idx" ON "DeliveryEvent"("messageId", "occurredAt");
CREATE INDEX "DeliveryEvent_userId_type_createdAt_idx" ON "DeliveryEvent"("userId", "type", "createdAt");
CREATE INDEX "Task_userId_status_createdAt_idx" ON "Task"("userId", "status", "createdAt");
CREATE INDEX "Task_campaignId_idx" ON "Task"("campaignId");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX "Lead_userId_score_idx" ON "Lead"("userId", "score");
CREATE INDEX "Lead_companyRecordId_idx" ON "Lead"("companyRecordId");
CREATE INDEX "Lead_contactRecordId_idx" ON "Lead"("contactRecordId");

ALTER TABLE "IdealCustomerProfile" ADD CONSTRAINT "IdealCustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyRecordId_fkey" FOREIGN KEY ("companyRecordId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactRecordId_fkey" FOREIGN KEY ("contactRecordId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyResearchResult" ADD CONSTRAINT "CompanyResearchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyResearchResult" ADD CONSTRAINT "CompanyResearchResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyResearchResult" ADD CONSTRAINT "CompanyResearchResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_researchResultId_fkey" FOREIGN KEY ("researchResultId") REFERENCES "CompanyResearchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchUsage" ADD CONSTRAINT "SearchUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_idealCustomerProfileId_fkey" FOREIGN KEY ("idealCustomerProfileId") REFERENCES "IdealCustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignApproval" ADD CONSTRAINT "CampaignApproval_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignApproval" ADD CONSTRAINT "CampaignApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CampaignMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OptOut" ADD CONSTRAINT "OptOut_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CampaignMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
