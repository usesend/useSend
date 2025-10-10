-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'RUNNING';
ALTER TYPE "CampaignStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "batchSize" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "batchWindowMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCursor" TEXT,
ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CampaignEmail" (
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEmail_pkey" PRIMARY KEY ("campaignId","contactId")
);

-- CreateIndex
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Contact_contactBookId_id_idx" ON "Contact"("contactBookId", "id");

-- CreateIndex
CREATE INDEX "Email_campaignId_contactId_idx" ON "Email"("campaignId", "contactId");
