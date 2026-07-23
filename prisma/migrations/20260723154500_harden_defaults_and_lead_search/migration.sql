-- New self-service accounts receive the least-privileged role by default.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- Support case-insensitive contains searches without scanning every lead.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX "Lead_userId_createdAt_idx";
CREATE INDEX "Lead_userId_createdAt_id_idx" ON "Lead"("userId", "createdAt", "id");
CREATE INDEX "Lead_company_trgm_idx" ON "Lead" USING GIN ("company" gin_trgm_ops);
CREATE INDEX "Lead_contact_trgm_idx" ON "Lead" USING GIN ("contact" gin_trgm_ops);
