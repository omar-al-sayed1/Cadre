-- AlterEnum
ALTER TYPE "AiOperation" ADD VALUE 'SALES_DISCOVER';

-- CreateTable
CREATE TABLE "sales_discovery_run" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "candidates" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "promptVersion" TEXT,
    "error" TEXT,
    "requestedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_discovery_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_discovery_run_companyId_createdAt_idx" ON "sales_discovery_run"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_discovery_run_companyId_status_idx" ON "sales_discovery_run"("companyId", "status");

-- AddForeignKey
ALTER TABLE "sales_discovery_run" ADD CONSTRAINT "sales_discovery_run_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
