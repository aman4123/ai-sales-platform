-- One-time bridge for the original two-table MVP database. The startup script only
-- invokes this after Prisma reports P3005, and this transaction aborts unless the
-- database has the exact legacy table/column fingerprint.
BEGIN;

DO $$
DECLARE
  actual_columns text[];
  expected_columns constant text[] := ARRAY[
    'Lead.id:text:NO',
    'Lead.company:text:NO',
    'Lead.contact:text:NO',
    'Lead.email:text:NO',
    'Lead.phone:text:NO',
    'Lead.status:text:NO',
    'Lead.userId:text:NO',
    'Lead.createdAt:timestamp:NO',
    'Lead.updatedAt:timestamp:NO',
    'User.id:text:NO',
    'User.name:text:NO',
    'User.email:text:NO',
    'User.password:text:NO',
    'User.role:text:NO',
    'User.createdAt:timestamp:NO',
    'User.updatedAt:timestamp:NO'
  ];
BEGIN
  SELECT array_agg(
    format('%s.%s:%s:%s', table_name, column_name, udt_name, is_nullable)
    ORDER BY table_name, ordinal_position
  )
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public';

  IF actual_columns IS DISTINCT FROM expected_columns THEN
    RAISE EXCEPTION 'Database does not match the supported legacy MVP schema; no changes were applied.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Lead"'::regclass
      AND conname = 'Lead_userId_fkey'
      AND pg_get_constraintdef(oid) =
        'FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE'
  ) THEN
    RAISE EXCEPTION 'Legacy Lead ownership constraint is missing or incompatible; no changes were applied.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE upper(role) NOT IN ('ADMIN', 'MEMBER', 'USER')
  ) THEN
    RAISE EXCEPTION 'Legacy database contains an unsupported user role; no changes were applied.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Lead"
    WHERE trim(both '_' FROM upper(regexp_replace(status, '[^A-Za-z0-9]+', '_', 'g')))
      NOT IN (
        'INTERESTED', 'NEW', 'CONTACTED', 'FOLLOW_UP', 'MEETING',
        'PROPOSAL', 'PROPOSAL_SENT', 'CLOSED', 'WON', 'LOST'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy database contains an unsupported lead status; no changes were applied.';
  END IF;
END $$;

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "LeadStatus" AS ENUM ('INTERESTED', 'MEETING', 'FOLLOW_UP', 'PROPOSAL_SENT', 'CLOSED', 'LOST');
CREATE TYPE "AiProvider" AS ENUM ('MOCK', 'DEEPSEEK');
CREATE TYPE "Theme" AS ENUM ('DARK', 'LIGHT', 'SYSTEM');
CREATE TYPE "AiRequestType" AS ENUM ('RESEARCH', 'EMAIL');
CREATE TYPE "AccountTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

ALTER TABLE "User" RENAME COLUMN "password" TO "passwordHash";
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING CASE
    WHEN upper("role") = 'ADMIN' THEN 'ADMIN'::"UserRole"
    ELSE 'MEMBER'::"UserRole"
  END;
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = "createdAt";
ALTER TABLE "User"
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3);

ALTER TABLE "Lead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lead"
  ALTER COLUMN "status" TYPE "LeadStatus"
  USING CASE trim(both '_' FROM upper(regexp_replace("status", '[^A-Za-z0-9]+', '_', 'g')))
    WHEN 'MEETING' THEN 'MEETING'::"LeadStatus"
    WHEN 'CONTACTED' THEN 'FOLLOW_UP'::"LeadStatus"
    WHEN 'FOLLOW_UP' THEN 'FOLLOW_UP'::"LeadStatus"
    WHEN 'PROPOSAL' THEN 'PROPOSAL_SENT'::"LeadStatus"
    WHEN 'PROPOSAL_SENT' THEN 'PROPOSAL_SENT'::"LeadStatus"
    WHEN 'CLOSED' THEN 'CLOSED'::"LeadStatus"
    WHEN 'WON' THEN 'CLOSED'::"LeadStatus"
    WHEN 'LOST' THEN 'LOST'::"LeadStatus"
    ELSE 'INTERESTED'::"LeadStatus"
  END;
ALTER TABLE "Lead"
  ALTER COLUMN "status" SET DEFAULT 'INTERESTED',
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3),
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "value" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "notes" TEXT;

CREATE TABLE "RefreshSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "company" TEXT NOT NULL DEFAULT '',
  "signature" TEXT NOT NULL DEFAULT '',
  "aiProvider" "AiProvider" NOT NULL DEFAULT 'MOCK',
  "theme" "Theme" NOT NULL DEFAULT 'DARK',
  "notifications" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRequest" (
  "id" TEXT NOT NULL,
  "type" "AiRequestType" NOT NULL,
  "prompt" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "type" "AccountTokenType" NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecoveryCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");
CREATE INDEX "RefreshSession_userId_revokedAt_idx" ON "RefreshSession"("userId", "revokedAt");
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");
CREATE INDEX "Lead_userId_createdAt_id_idx" ON "Lead"("userId", "createdAt", "id");
CREATE INDEX "Lead_userId_status_idx" ON "Lead"("userId", "status");
CREATE INDEX "Lead_company_trgm_idx" ON "Lead" USING GIN ("company" gin_trgm_ops);
CREATE INDEX "Lead_contact_trgm_idx" ON "Lead" USING GIN ("contact" gin_trgm_ops);
CREATE INDEX "Lead_email_trgm_idx" ON "Lead" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "Lead_industry_trgm_idx" ON "Lead" USING GIN ("industry" gin_trgm_ops);
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
CREATE INDEX "AiRequest_userId_type_createdAt_idx" ON "AiRequest"("userId", "type", "createdAt");
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");
CREATE INDEX "AccountToken_userId_type_expiresAt_idx" ON "AccountToken"("userId", "type", "expiresAt");
CREATE INDEX "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");
CREATE INDEX "RecoveryCode_userId_usedAt_idx" ON "RecoveryCode"("userId", "usedAt");

ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
