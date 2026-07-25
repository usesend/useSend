-- CreateEnum
CREATE TYPE "CampaignDeliveryMode" AS ENUM ('ALL_AT_ONCE', 'GRADUAL');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'PROCESSING', 'QUEUED', 'SUPPRESSED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "CampaignEmail" ALTER COLUMN "emailId" DROP NOT NULL;
-- PostgreSQL 11+ stores a constant default as metadata instead of rewriting
-- every existing row. Existing recipients are already queued, while new rows
-- created by the gradual delivery worker should default to pending.
ALTER TABLE "CampaignEmail" ADD COLUMN "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'QUEUED';
ALTER TABLE "CampaignEmail" ADD COLUMN "processedAt" TIMESTAMP(3);
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
