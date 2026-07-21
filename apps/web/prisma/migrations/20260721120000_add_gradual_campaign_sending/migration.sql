-- CreateEnum
CREATE TYPE "CampaignDeliveryMode" AS ENUM ('ALL_AT_ONCE', 'GRADUAL');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SUPPRESSED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "CampaignEmail" ALTER COLUMN "emailId" DROP NOT NULL;
ALTER TABLE "CampaignEmail" ADD COLUMN "status" "CampaignRecipientStatus";
ALTER TABLE "CampaignEmail" ADD COLUMN "processedAt" TIMESTAMP(3);

UPDATE "CampaignEmail"
SET "status" = 'QUEUED', "processedAt" = "createdAt";

ALTER TABLE "CampaignEmail" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "CampaignEmail" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "deliveryMode" "CampaignDeliveryMode" NOT NULL DEFAULT 'ALL_AT_ONCE';
ALTER TABLE "Campaign" ADD COLUMN "deliveryBatchPercentage" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "deliveryIntervalMinutes" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "deliveryBatchSize" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "currentDeliveryBatch" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN "deliveryBatchProcessed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN "nextDeliveryAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "audienceCapturedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "audiencePreparedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "pausedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CampaignEmail_campaignId_status_contactId_idx" ON "CampaignEmail"("campaignId", "status", "contactId");

-- CreateIndex
CREATE INDEX "Campaign_status_nextDeliveryAt_idx" ON "Campaign"("status", "nextDeliveryAt");
