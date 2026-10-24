-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('INTERVIEWER', 'SALES', 'CUSTOMER_SUPPORT', 'PHONE', 'EMAIL', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('SETUP', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'RESEARCHING', 'QUALIFIED', 'UNQUALIFIED', 'CONTACTED', 'ENGAGED', 'INTERESTED', 'MEETING_REQUESTED', 'MEETING_BOOKED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'CRM', 'API', 'DISCOVERY', 'INBOUND');

-- AlterEnum
ALTER TYPE "ActorType" ADD VALUE 'AI';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiOperation" ADD VALUE 'SALES_COPILOT';
ALTER TYPE "AiOperation" ADD VALUE 'SALES_RESEARCH';
ALTER TYPE "AiOperation" ADD VALUE 'SALES_QUALIFY';
ALTER TYPE "AiOperation" ADD VALUE 'SALES_GENERATE_MESSAGE';
ALTER TYPE "AiOperation" ADD VALUE 'SALES_ANALYZE_CONVERSATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompanyRole" ADD VALUE 'SALES_MANAGER';
ALTER TYPE "CompanyRole" ADD VALUE 'SALES_REP';
ALTER TYPE "CompanyRole" ADD VALUE 'VIEWER';

-- AlterTable
ALTER TABLE "ai_usage_event" ADD COLUMN     "agentType" "AgentType",
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "limits" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "productKey" TEXT NOT NULL DEFAULT 'interviewer',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "product_subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "planId" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "AgentType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'SETUP',
    "config" JSONB NOT NULL DEFAULT '{}',
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_lead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "companyName" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "website" TEXT,
    "domain" TEXT,
    "linkedinUrl" TEXT,
    "location" TEXT,
    "city" TEXT,
    "country" TEXT,
    "industry" TEXT,
    "companySize" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "qualificationScore" INTEGER,
    "intentScore" INTEGER,
    "leadScore" INTEGER,
    "scoreBreakdown" JSONB,
    "scoredAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doNotContactAt" TIMESTAMP(3),
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_activity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_subscription_status_trialEndsAt_idx" ON "product_subscription"("status", "trialEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_subscription_companyId_productKey_key" ON "product_subscription"("companyId", "productKey");

-- CreateIndex
CREATE UNIQUE INDEX "agent_companyId_type_key" ON "agent"("companyId", "type");

-- CreateIndex
CREATE INDEX "sales_lead_companyId_status_idx" ON "sales_lead"("companyId", "status");

-- CreateIndex
CREATE INDEX "sales_lead_companyId_leadScore_idx" ON "sales_lead"("companyId", "leadScore");

-- CreateIndex
CREATE INDEX "sales_lead_companyId_createdAt_idx" ON "sales_lead"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_lead_companyId_emailNormalized_idx" ON "sales_lead"("companyId", "emailNormalized");

-- CreateIndex
CREATE INDEX "sales_lead_companyId_domain_idx" ON "sales_lead"("companyId", "domain");

-- CreateIndex
CREATE INDEX "sales_lead_companyId_phoneNormalized_idx" ON "sales_lead"("companyId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "sales_activity_companyId_createdAt_idx" ON "sales_activity"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_activity_leadId_createdAt_idx" ON "sales_activity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_companyId_agentType_createdAt_idx" ON "ai_usage_event"("companyId", "agentType", "createdAt");

-- CreateIndex
CREATE INDEX "plan_productKey_sortOrder_idx" ON "plan"("productKey", "sortOrder");

-- AddForeignKey
ALTER TABLE "product_subscription" ADD CONSTRAINT "product_subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_subscription" ADD CONSTRAINT "product_subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent" ADD CONSTRAINT "agent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lead" ADD CONSTRAINT "sales_lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lead" ADD CONSTRAINT "sales_lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales_lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing company keeps using the AI Interviewer (active subscription on its current plan).
INSERT INTO "product_subscription" ("id", "companyId", "productKey", "planId", "status", "currentPeriodStart", "createdAt", "updatedAt")
SELECT 'ps_' || md5(c."id" || ':interviewer'), c."id", 'interviewer', c."planId", 'ACTIVE', NOW(), NOW(), NOW()
FROM "company" c
WHERE c."deletedAt" IS NULL
ON CONFLICT ("companyId", "productKey") DO NOTHING;
