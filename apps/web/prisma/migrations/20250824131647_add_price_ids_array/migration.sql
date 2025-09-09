-- CreateEnum
CREATE TYPE "SendingDisabledReason" AS ENUM ('FREE_LIMIT_REACHED', 'BILLING_ISSUE', 'SPAM');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "priceIds" TEXT[];

-- Populate priceIds array with existing priceId values
UPDATE "Subscription" SET "priceIds" = ARRAY["priceId"] WHERE "priceId" IS NOT NULL;
