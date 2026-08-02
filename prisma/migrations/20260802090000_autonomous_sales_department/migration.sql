ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MASTER_ADMIN';

UPDATE "Plan"
SET
  "aiMonthlyRequestLimit" = GREATEST("aiMonthlyRequestLimit", 10),
  "researchMonthlyLimit" = GREATEST("researchMonthlyLimit", 5),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'FREE_TRIAL';

CREATE TYPE "WorkspaceKind" AS ENUM ('CUSTOMER', 'INTERNAL', 'TEST');
CREATE TYPE "AutonomyMode" AS ENUM ('MANUAL', 'ASSISTED', 'AUTONOMOUS');
CREATE TYPE "SalesDepartmentStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'PAUSED', 'BLOCKED', 'STOPPED');
CREATE TYPE "AutomationJobStatus" AS ENUM (
  'PENDING', 'RUNNING', 'RETRY_SCHEDULED', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'
);
CREATE TYPE "AutomationJobCategory" AS ENUM (
  'STRATEGY_PREPARATION',
  'LEAD_DISCOVERY',
  'COMPANY_RESEARCH',
  'QUALIFICATION',
  'CRM_SYNCHRONIZATION',
  'MESSAGE_GENERATION',
  'APPROVAL_READINESS',
  'SENDING',
  'FOLLOW_UP',
  'INBOUND_WEBHOOK_PROCESSING',
  'REPLY_CLASSIFICATION',
  'TASK_GENERATION',
  'MEETING_PREPARATION',
  'DAILY_BRIEFING',
  'ANALYTICS_AGGREGATION',
  'STALE_OPPORTUNITY_REVIEW',
  'PROVIDER_HEALTH_CHECK'
);
CREATE TYPE "FeatureFlagScope" AS ENUM ('GLOBAL', 'TENANT', 'USER');
CREATE TYPE "SupportAccessLevel" AS ENUM ('READ_ONLY', 'WRITE');

ALTER TABLE "Tenant"
  ADD COLUMN "kind" "WorkspaceKind" NOT NULL DEFAULT 'CUSTOMER';

UPDATE "Tenant" tenant
SET
  "kind" = 'INTERNAL',
  "name" = 'Internal Company Workspace',
  "slug" = 'internal-company-' || substring(md5(tenant."ownerUserId"), 1, 12)
FROM "User" account
WHERE account."id" = tenant."ownerUserId"
  AND account."role" = 'SUPER_ADMIN';

CREATE UNIQUE INDEX "Tenant_ownerUserId_kind_key" ON "Tenant"("ownerUserId", "kind");
CREATE INDEX "Tenant_kind_status_idx" ON "Tenant"("kind", "status");

CREATE TABLE "SalesDepartmentConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mode" "AutonomyMode" NOT NULL DEFAULT 'MANUAL',
  "status" "SalesDepartmentStatus" NOT NULL DEFAULT 'DRAFT',
  "outreachGoal" TEXT NOT NULL DEFAULT '',
  "searchLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "approvedClaims" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "prohibitedClaims" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "approvalPolicy" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "dailyContactLimit" INTEGER NOT NULL DEFAULT 10,
  "monthlyContactLimit" INTEGER NOT NULL DEFAULT 100,
  "maximumFollowUps" INTEGER NOT NULL DEFAULT 2,
  "maximumRetries" INTEGER NOT NULL DEFAULT 3,
  "quietHours" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "budgetMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "senderIdentity" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "senderVerified" BOOLEAN NOT NULL DEFAULT false,
  "humanMeetingOwner" TEXT NOT NULL DEFAULT '',
  "emergencyStoppedAt" TIMESTAMP(3),
  "lastStartedAt" TIMESTAMP(3),
  "lastPausedAt" TIMESTAMP(3),
  "lastBlockerCode" TEXT,
  "lastBlockerMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesDepartmentConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "category" "AutomationJobCategory" NOT NULL,
  "status" "AutomationJobStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "resultSummary" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "scope" "FeatureFlagScope" NOT NULL DEFAULT 'GLOBAL',
  "tenantId" TEXT,
  "userId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportSession" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accessLevel" "SupportAccessLevel" NOT NULL DEFAULT 'READ_ONLY',
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlobalRecipientSafety" (
  "id" TEXT NOT NULL,
  "recipientHash" TEXT NOT NULL,
  "domainHash" TEXT NOT NULL,
  "rollingDayCount" INTEGER NOT NULL DEFAULT 0,
  "rollingMonthCount" INTEGER NOT NULL DEFAULT 0,
  "rollingDayStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rollingMonthStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cooldownUntil" TIMESTAMP(3),
  "globallySuppressedAt" TIMESTAMP(3),
  "suppressionReason" TEXT,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalRecipientSafety_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlobalDomainSafety" (
  "id" TEXT NOT NULL,
  "domainHash" TEXT NOT NULL,
  "rollingDayCount" INTEGER NOT NULL DEFAULT 0,
  "rollingMonthCount" INTEGER NOT NULL DEFAULT 0,
  "rollingDayStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rollingMonthStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cooldownUntil" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalDomainSafety_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SalesDepartmentConfig" ("id", "tenantId", "createdAt", "updatedAt")
SELECT 'sales_department_' || md5("id"), "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant"
ON CONFLICT DO NOTHING;

INSERT INTO "Tenant" ("id", "name", "slug", "status", "kind", "ownerUserId", "createdAt", "updatedAt")
SELECT
  'tenant_test_' || md5(account."id"),
  'Internal Tester Workspace',
  'internal-tester-' || substring(md5(account."id"), 1, 12),
  'ACTIVE',
  'TEST',
  account."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" account
WHERE account."role" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "role", "createdAt", "updatedAt")
SELECT
  'membership_test_' || md5(account."id"),
  'tenant_test_' || md5(account."id"),
  account."id",
  'TENANT_ADMIN',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" account
WHERE account."role" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "Subscription" ("id", "tenantId", "planId", "status", "startsAt", "updatedAt")
SELECT
  'subscription_test_' || md5(account."id"),
  'tenant_test_' || md5(account."id"),
  'plan_internal',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" account
WHERE account."role" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "AiBudget" (
  "id", "tenantId", "mode", "monthlyRequestLimit", "warningThresholdPercent",
  "manualOverrideReason", "configuredById", "configuredAt", "createdAt", "updatedAt"
)
SELECT
  'ai_budget_test_' || md5(account."id"),
  'tenant_test_' || md5(account."id"),
  'INTERNAL_UNLIMITED',
  0,
  80,
  'Secure isolated Tester Mode access.',
  account."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" account
WHERE account."role" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "SalesDepartmentConfig" ("id", "tenantId", "createdAt", "updatedAt")
SELECT
  'sales_department_test_' || md5(account."id"),
  'tenant_test_' || md5(account."id"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" account
WHERE account."role" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

ALTER TABLE "Lead" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "IdealCustomerProfile" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SalesGoal" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Company" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CrmActivity" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Note" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ResearchJob" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CompanyResearchResult" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "EvidenceItem" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SearchUsage" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CampaignMessage" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CampaignApproval" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Reply" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "DeliveryEvent" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "OptOut" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Task" ADD COLUMN "tenantId" TEXT;

CREATE TEMP TABLE "_tenant_backfill" AS
SELECT DISTINCT ON (membership."userId") membership."userId", membership."tenantId"
FROM "TenantMembership" membership
JOIN "Tenant" tenant ON tenant."id" = membership."tenantId"
ORDER BY membership."userId", CASE tenant."kind" WHEN 'CUSTOMER' THEN 0 WHEN 'INTERNAL' THEN 1 ELSE 2 END, membership."createdAt";

UPDATE "Lead" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "IdealCustomerProfile" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "SalesGoal" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "Company" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "Contact" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "Deal" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "CrmActivity" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "Note" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "ResearchJob" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "CompanyResearchResult" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "SearchUsage" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "Campaign" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "CampaignMessage" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "Reply" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "DeliveryEvent" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "OptOut" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "Task" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId";
UPDATE "AiRequest" record SET "tenantId" = mapping."tenantId" FROM "_tenant_backfill" mapping WHERE record."userId" = mapping."userId" AND record."tenantId" IS NULL;

UPDATE "EvidenceItem" evidence SET "tenantId" = result."tenantId" FROM "CompanyResearchResult" result WHERE result."id" = evidence."researchResultId";
UPDATE "CampaignRecipient" recipient SET "tenantId" = campaign."tenantId" FROM "Campaign" campaign WHERE campaign."id" = recipient."campaignId";
UPDATE "CampaignApproval" approval SET "tenantId" = campaign."tenantId" FROM "Campaign" campaign WHERE campaign."id" = approval."campaignId";

ALTER TABLE "Lead" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "IdealCustomerProfile" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SalesGoal" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Contact" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Deal" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CrmActivity" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Note" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ResearchJob" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CompanyResearchResult" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "EvidenceItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SearchUsage" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CampaignRecipient" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CampaignMessage" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CampaignApproval" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Reply" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "DeliveryEvent" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "OptOut" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AiRequest" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "SalesDepartmentConfig" ADD CONSTRAINT "SalesDepartmentConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdealCustomerProfile" ADD CONSTRAINT "IdealCustomerProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyResearchResult" ADD CONSTRAINT "CompanyResearchResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchUsage" ADD CONSTRAINT "SearchUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignApproval" ADD CONSTRAINT "CampaignApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OptOut" ADD CONSTRAINT "OptOut_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SalesDepartmentConfig_tenantId_key" ON "SalesDepartmentConfig"("tenantId");
CREATE INDEX "SalesDepartmentConfig_status_updatedAt_idx" ON "SalesDepartmentConfig"("status", "updatedAt");
CREATE UNIQUE INDEX "AutomationJob_tenantId_idempotencyKey_key" ON "AutomationJob"("tenantId", "idempotencyKey");
CREATE INDEX "AutomationJob_tenantId_status_scheduledAt_idx" ON "AutomationJob"("tenantId", "status", "scheduledAt");
CREATE INDEX "AutomationJob_status_nextAttemptAt_idx" ON "AutomationJob"("status", "nextAttemptAt");
CREATE INDEX "AutomationJob_ownerUserId_createdAt_idx" ON "AutomationJob"("ownerUserId", "createdAt");
CREATE UNIQUE INDEX "FeatureFlag_key_scope_tenantId_userId_key" ON "FeatureFlag"("key", "scope", "tenantId", "userId") NULLS NOT DISTINCT;
CREATE INDEX "FeatureFlag_scope_enabled_idx" ON "FeatureFlag"("scope", "enabled");
CREATE INDEX "FeatureFlag_tenantId_key_idx" ON "FeatureFlag"("tenantId", "key");
CREATE INDEX "FeatureFlag_userId_key_idx" ON "FeatureFlag"("userId", "key");
CREATE INDEX "SupportSession_actorUserId_startedAt_idx" ON "SupportSession"("actorUserId", "startedAt");
CREATE INDEX "SupportSession_targetUserId_startedAt_idx" ON "SupportSession"("targetUserId", "startedAt");
CREATE INDEX "SupportSession_tenantId_endedAt_idx" ON "SupportSession"("tenantId", "endedAt");
CREATE UNIQUE INDEX "GlobalRecipientSafety_recipientHash_key" ON "GlobalRecipientSafety"("recipientHash");
CREATE INDEX "GlobalRecipientSafety_domainHash_lastSentAt_idx" ON "GlobalRecipientSafety"("domainHash", "lastSentAt");
CREATE INDEX "GlobalRecipientSafety_cooldownUntil_idx" ON "GlobalRecipientSafety"("cooldownUntil");
CREATE UNIQUE INDEX "GlobalDomainSafety_domainHash_key" ON "GlobalDomainSafety"("domainHash");
CREATE INDEX "GlobalDomainSafety_cooldownUntil_idx" ON "GlobalDomainSafety"("cooldownUntil");

CREATE INDEX "Lead_tenantId_createdAt_id_idx" ON "Lead"("tenantId", "createdAt", "id");
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");
CREATE INDEX "IdealCustomerProfile_tenantId_createdAt_idx" ON "IdealCustomerProfile"("tenantId", "createdAt");
CREATE INDEX "SalesGoal_tenantId_status_createdAt_idx" ON "SalesGoal"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "Company_tenantId_domain_key" ON "Company"("tenantId", "domain");
CREATE INDEX "Company_tenantId_name_idx" ON "Company"("tenantId", "name");
CREATE INDEX "Company_tenantId_deletedAt_idx" ON "Company"("tenantId", "deletedAt");
CREATE UNIQUE INDEX "Contact_tenantId_publicEmail_key" ON "Contact"("tenantId", "publicEmail");
CREATE INDEX "Contact_tenantId_name_idx" ON "Contact"("tenantId", "name");
CREATE INDEX "Contact_tenantId_deletedAt_idx" ON "Contact"("tenantId", "deletedAt");
CREATE INDEX "Deal_tenantId_stage_idx" ON "Deal"("tenantId", "stage");
CREATE INDEX "CrmActivity_tenantId_occurredAt_idx" ON "CrmActivity"("tenantId", "occurredAt");
CREATE INDEX "Note_tenantId_createdAt_idx" ON "Note"("tenantId", "createdAt");
CREATE INDEX "ResearchJob_tenantId_createdAt_idx" ON "ResearchJob"("tenantId", "createdAt");
CREATE INDEX "ResearchJob_tenantId_status_idx" ON "ResearchJob"("tenantId", "status");
CREATE INDEX "CompanyResearchResult_tenantId_createdAt_idx" ON "CompanyResearchResult"("tenantId", "createdAt");
CREATE INDEX "CompanyResearchResult_tenantId_domain_idx" ON "CompanyResearchResult"("tenantId", "domain");
CREATE INDEX "EvidenceItem_tenantId_createdAt_idx" ON "EvidenceItem"("tenantId", "createdAt");
CREATE UNIQUE INDEX "SearchUsage_tenantId_provider_month_key" ON "SearchUsage"("tenantId", "provider", "month");
CREATE INDEX "SearchUsage_tenantId_month_idx" ON "SearchUsage"("tenantId", "month");
CREATE INDEX "Campaign_tenantId_status_idx" ON "Campaign"("tenantId", "status");
CREATE INDEX "Campaign_tenantId_createdAt_idx" ON "Campaign"("tenantId", "createdAt");
CREATE INDEX "CampaignRecipient_tenantId_status_idx" ON "CampaignRecipient"("tenantId", "status");
CREATE INDEX "CampaignMessage_tenantId_status_scheduledAt_idx" ON "CampaignMessage"("tenantId", "status", "scheduledAt");
CREATE INDEX "CampaignApproval_tenantId_createdAt_idx" ON "CampaignApproval"("tenantId", "createdAt");
CREATE INDEX "Reply_tenantId_receivedAt_idx" ON "Reply"("tenantId", "receivedAt");
CREATE INDEX "DeliveryEvent_tenantId_type_createdAt_idx" ON "DeliveryEvent"("tenantId", "type", "createdAt");
CREATE UNIQUE INDEX "OptOut_tenantId_emailHash_key" ON "OptOut"("tenantId", "emailHash");
CREATE UNIQUE INDEX "Reply_tenantId_providerReplyId_key" ON "Reply"("tenantId", "providerReplyId");

DROP INDEX "Company_userId_domain_key";
DROP INDEX "Contact_userId_publicEmail_key";
DROP INDEX "SearchUsage_userId_provider_month_key";
DROP INDEX "Reply_userId_providerReplyId_key";
DROP INDEX "OptOut_userId_emailHash_key";
CREATE INDEX "OptOut_tenantId_createdAt_idx" ON "OptOut"("tenantId", "createdAt");
CREATE INDEX "Task_tenantId_status_createdAt_idx" ON "Task"("tenantId", "status", "createdAt");

ALTER TABLE "SalesDepartmentConfig" ADD CONSTRAINT "SalesDepartmentConfig_limits_check" CHECK (
  "dailyContactLimit" > 0 AND
  "monthlyContactLimit" >= "dailyContactLimit" AND
  "maximumFollowUps" BETWEEN 0 AND 10 AND
  "maximumRetries" BETWEEN 0 AND 10 AND
  "budgetMinor" >= 0
);
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_bounds_check" CHECK (
  "attemptCount" >= 0 AND
  "maxAttempts" BETWEEN 1 AND 10 AND
  "timeoutMs" BETWEEN 1000 AND 300000
);
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_rollout_check" CHECK (
  "rolloutPercent" BETWEEN 0 AND 100 AND
  (("scope" = 'GLOBAL' AND "tenantId" IS NULL AND "userId" IS NULL) OR
   ("scope" = 'TENANT' AND "tenantId" IS NOT NULL AND "userId" IS NULL) OR
   ("scope" = 'USER' AND "tenantId" IS NULL AND "userId" IS NOT NULL))
);
