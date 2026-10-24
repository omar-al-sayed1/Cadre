-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('EMAIL', 'LINKEDIN', 'SMS', 'WHATSAPP', 'CALL', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "SalesMessageStatus" AS ENUM ('DRAFT', 'LOGGED', 'APPROVED', 'SENT', 'FAILED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBED', 'BOUNCED', 'COMPLAINT', 'MANUAL');

-- AlterTable
ALTER TABLE "sales_lead" ADD COLUMN     "problemRelevance" INTEGER;

-- CreateTable
CREATE TABLE "sales_lead_research" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "error" TEXT,
    "requestedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_lead_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_conversation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "SalesChannel" NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_message" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "channel" "SalesChannel" NOT NULL,
    "status" "SalesMessageStatus" NOT NULL,
    "messageType" TEXT,
    "sender" TEXT,
    "recipient" TEXT,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "analysis" JSONB,
    "providerMessageId" TEXT,
    "createdById" TEXT,
    "generatedByAi" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_suppression" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "leadId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_suppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_lead_research_leadId_createdAt_idx" ON "sales_lead_research"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_lead_research_companyId_status_idx" ON "sales_lead_research"("companyId", "status");

-- CreateIndex
CREATE INDEX "sales_conversation_companyId_lastMessageAt_idx" ON "sales_conversation"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "sales_conversation_leadId_lastMessageAt_idx" ON "sales_conversation"("leadId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "sales_message_conversationId_occurredAt_idx" ON "sales_message"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "sales_message_companyId_status_idx" ON "sales_message"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_suppression_companyId_kind_value_key" ON "sales_suppression"("companyId", "kind", "value");

-- AddForeignKey
ALTER TABLE "sales_lead_research" ADD CONSTRAINT "sales_lead_research_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lead_research" ADD CONSTRAINT "sales_lead_research_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales_lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_conversation" ADD CONSTRAINT "sales_conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_conversation" ADD CONSTRAINT "sales_conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales_lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_message" ADD CONSTRAINT "sales_message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_message" ADD CONSTRAINT "sales_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "sales_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_suppression" ADD CONSTRAINT "sales_suppression_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
