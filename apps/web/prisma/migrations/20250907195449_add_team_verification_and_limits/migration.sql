-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "dailyEmailLimit" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "SendingDisabledReason";
