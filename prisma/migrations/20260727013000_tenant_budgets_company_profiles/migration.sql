CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "TenantRole" AS ENUM (
  'TENANT_ADMIN',
  'SALES_MANAGER',
  'SALES_USER',
  'REVIEWER',
  'BILLING_ADMIN',
  'VIEWER'
);
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'SUSPENDED');
CREATE TYPE "AiBudgetMode" AS ENUM ('DISABLED', 'LIMITED', 'INTERNAL_UNLIMITED');
CREATE TYPE "CompanyProfileStatus" AS ENUM ('DRAFT', 'APPROVED');

ALTER TABLE "User"
  ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "lastActiveAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantMembership" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TenantRole" NOT NULL DEFAULT 'SALES_USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Plan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "description" TEXT NOT NULL DEFAULT '',
  "monthlyPriceMinor" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "userLimit" INTEGER NOT NULL DEFAULT 1,
  "leadLimit" INTEGER NOT NULL DEFAULT 100,
  "campaignLimit" INTEGER NOT NULL DEFAULT 3,
  "aiMonthlyRequestLimit" INTEGER NOT NULL DEFAULT 0,
  "researchMonthlyLimit" INTEGER NOT NULL DEFAULT 0,
  "storageLimitMb" INTEGER NOT NULL DEFAULT 100,
  "features" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "overrideLimits" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiBudget" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mode" "AiBudgetMode" NOT NULL DEFAULT 'DISABLED',
  "monthlyRequestLimit" INTEGER NOT NULL DEFAULT 0,
  "warningThresholdPercent" INTEGER NOT NULL DEFAULT 80,
  "manualOverrideReason" TEXT,
  "configuredById" TEXT,
  "configuredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" "CompanyProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "companyName" TEXT NOT NULL DEFAULT '',
  "website" TEXT,
  "industry" TEXT,
  "description" TEXT,
  "products" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "useCases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pricingSummary" TEXT,
  "targetIndustries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetCompanySizes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetJobTitles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "exclusions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "valuePropositions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "competitors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "caseStudies" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "testimonials" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "faqs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "commonObjections" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "knowledgeSources" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "preferredTone" TEXT NOT NULL DEFAULT 'Professional',
  "complianceRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contactDetails" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "meetingPreferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailySalesBrief" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "briefDate" DATE NOT NULL,
  "metrics" JSONB NOT NULL,
  "failures" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "risks" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "approvals" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "priorities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "dataLabel" TEXT NOT NULL DEFAULT 'REAL',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailySalesBrief_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RefreshSession" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AiRequest"
  ADD COLUMN "tenantId" TEXT,
  ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "estimatedCostMinor" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "Plan" (
  "id", "code", "name", "status", "description", "monthlyPriceMinor", "currency",
  "userLimit", "leadLimit", "campaignLimit", "aiMonthlyRequestLimit",
  "researchMonthlyLimit", "storageLimitMb", "features", "updatedAt"
) VALUES
  ('plan_free_trial', 'FREE_TRIAL', 'Free Trial', 'ACTIVE', 'Safe evaluation plan with external actions disabled by default.', 0, 'INR', 1, 100, 3, 0, 0, 100, '{"testerMode":true}'::jsonb, CURRENT_TIMESTAMP),
  ('plan_starter', 'STARTER', 'Starter', 'ACTIVE', 'Starter plan. Limits require operator configuration before paid use.', NULL, 'INR', 3, 1000, 10, 0, 0, 500, '{}'::jsonb, CURRENT_TIMESTAMP),
  ('plan_growth', 'GROWTH', 'Growth', 'ACTIVE', 'Growth plan. Limits require operator configuration before paid use.', NULL, 'INR', 10, 10000, 50, 0, 0, 2048, '{}'::jsonb, CURRENT_TIMESTAMP),
  ('plan_business', 'BUSINESS', 'Business', 'ACTIVE', 'Business plan. Limits require operator configuration before paid use.', NULL, 'INR', 25, 50000, 200, 0, 0, 10240, '{}'::jsonb, CURRENT_TIMESTAMP),
  ('plan_enterprise', 'ENTERPRISE', 'Enterprise', 'ACTIVE', 'Enterprise plan with explicit custom limits.', NULL, 'INR', 100, 250000, 1000, 0, 0, 51200, '{}'::jsonb, CURRENT_TIMESTAMP),
  ('plan_custom', 'CUSTOM', 'Custom', 'ACTIVE', 'Operator-defined custom plan.', NULL, 'INR', 1, 0, 0, 0, 0, 100, '{}'::jsonb, CURRENT_TIMESTAMP),
  ('plan_internal', 'INTERNAL', 'Internal', 'ACTIVE', 'Platform-owner internal testing plan.', 0, 'INR', 25, 1000000, 100000, 0, 0, 10240, '{"internal":true,"testerMode":true}'::jsonb, CURRENT_TIMESTAMP),
  ('plan_lifetime', 'LIFETIME', 'Lifetime', 'ACTIVE', 'Manually assigned lifetime access; usage limits still apply.', NULL, 'INR', 10, 100000, 500, 0, 0, 10240, '{}'::jsonb, CURRENT_TIMESTAMP);

INSERT INTO "Tenant" ("id", "name", "slug", "status", "ownerUserId", "createdAt", "updatedAt")
SELECT
  'tenant_' || md5("id"),
  CASE WHEN trim("name") = '' THEN 'Personal workspace' ELSE trim("name") || '''s workspace' END,
  'workspace-' || substring(md5("id"), 1, 16),
  'ACTIVE',
  "id",
  "createdAt",
  CURRENT_TIMESTAMP
FROM "User";

INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "role", "createdAt", "updatedAt")
SELECT
  'membership_' || md5("id"),
  'tenant_' || md5("id"),
  "id",
  'TENANT_ADMIN',
  "createdAt",
  CURRENT_TIMESTAMP
FROM "User";

INSERT INTO "Subscription" (
  "id", "tenantId", "planId", "status", "startsAt", "trialEndsAt", "updatedAt"
)
SELECT
  'subscription_' || md5("id"),
  'tenant_' || md5("id"),
  CASE WHEN "role" = 'SUPER_ADMIN' THEN 'plan_internal' ELSE 'plan_free_trial' END,
  CASE WHEN "role" = 'SUPER_ADMIN' THEN 'ACTIVE'::"SubscriptionStatus" ELSE 'TRIAL'::"SubscriptionStatus" END,
  "createdAt",
  CASE WHEN "role" = 'SUPER_ADMIN' THEN NULL ELSE CURRENT_TIMESTAMP + INTERVAL '14 days' END,
  CURRENT_TIMESTAMP
FROM "User";

INSERT INTO "AiBudget" (
  "id", "tenantId", "mode", "monthlyRequestLimit", "warningThresholdPercent",
  "manualOverrideReason", "configuredById", "configuredAt", "updatedAt"
)
SELECT
  'ai_budget_' || md5("id"),
  'tenant_' || md5("id"),
  CASE WHEN "role" = 'SUPER_ADMIN' THEN 'INTERNAL_UNLIMITED'::"AiBudgetMode" ELSE 'DISABLED'::"AiBudgetMode" END,
  0,
  80,
  CASE WHEN "role" = 'SUPER_ADMIN' THEN 'Secure initial Master Admin internal access.' ELSE NULL END,
  CASE WHEN "role" = 'SUPER_ADMIN' THEN "id" ELSE NULL END,
  CASE WHEN "role" = 'SUPER_ADMIN' THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP
FROM "User";

UPDATE "RefreshSession" session
SET "tenantId" = membership."tenantId"
FROM "TenantMembership" membership
WHERE membership."userId" = session."userId";

UPDATE "AuditLog" audit
SET "tenantId" = membership."tenantId"
FROM "TenantMembership" membership
WHERE membership."userId" = audit."actorUserId";

UPDATE "AiRequest" request
SET "tenantId" = membership."tenantId"
FROM "TenantMembership" membership
WHERE membership."userId" = request."userId";

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Tenant_status_createdAt_idx" ON "Tenant"("status", "createdAt");
CREATE INDEX "Tenant_ownerUserId_idx" ON "Tenant"("ownerUserId");
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");
CREATE INDEX "TenantMembership_userId_tenantId_idx" ON "TenantMembership"("userId", "tenantId");
CREATE INDEX "TenantMembership_tenantId_role_idx" ON "TenantMembership"("tenantId", "role");
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");
CREATE INDEX "Subscription_status_trialEndsAt_idx" ON "Subscription"("status", "trialEndsAt");
CREATE UNIQUE INDEX "AiBudget_tenantId_key" ON "AiBudget"("tenantId");
CREATE INDEX "AiBudget_mode_updatedAt_idx" ON "AiBudget"("mode", "updatedAt");
CREATE UNIQUE INDEX "CompanyProfile_tenantId_key" ON "CompanyProfile"("tenantId");
CREATE INDEX "CompanyProfile_status_updatedAt_idx" ON "CompanyProfile"("status", "updatedAt");
CREATE UNIQUE INDEX "DailySalesBrief_tenantId_briefDate_key" ON "DailySalesBrief"("tenantId", "briefDate");
CREATE INDEX "DailySalesBrief_tenantId_generatedAt_idx" ON "DailySalesBrief"("tenantId", "generatedAt");
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");
CREATE INDEX "RefreshSession_tenantId_revokedAt_idx" ON "RefreshSession"("tenantId", "revokedAt");
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AiRequest_tenantId_createdAt_idx" ON "AiRequest"("tenantId", "createdAt");

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TenantMembership"
  ADD CONSTRAINT "TenantMembership_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshSession"
  ADD CONSTRAINT "RefreshSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Subscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiBudget"
  ADD CONSTRAINT "AiBudget_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyProfile"
  ADD CONSTRAINT "CompanyProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailySalesBrief"
  ADD CONSTRAINT "DailySalesBrief_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiBudget"
  ADD CONSTRAINT "AiBudget_limits_check"
  CHECK (
    "monthlyRequestLimit" >= 0
    AND "warningThresholdPercent" BETWEEN 1 AND 100
    AND (
      ("mode" = 'LIMITED' AND "monthlyRequestLimit" > 0)
      OR ("mode" <> 'LIMITED')
    )
  );
ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_limits_nonnegative_check"
  CHECK (
    "userLimit" >= 0
    AND "leadLimit" >= 0
    AND "campaignLimit" >= 0
    AND "aiMonthlyRequestLimit" >= 0
    AND "researchMonthlyLimit" >= 0
    AND "storageLimitMb" >= 0
  );
ALTER TABLE "CompanyProfile"
  ADD CONSTRAINT "CompanyProfile_version_positive_check" CHECK ("version" >= 1);
