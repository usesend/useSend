-- CreateEnum
CREATE TYPE "TeamActionType" AS ENUM ('ALERT', 'PAUSE', 'RESUME', 'BLOCK', 'UNBLOCK');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "sendingPausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SendingCohort" (
    "teamId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "hardBounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendingCohort_pkey" PRIMARY KEY ("teamId","date")
);

-- CreateTable
CREATE TABLE "TeamAction" (
    "id" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "action" "TeamActionType" NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamAction_teamId_createdAt_idx" ON "TeamAction"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "SendingCohort" ADD CONSTRAINT "SendingCohort_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAction" ADD CONSTRAINT "TeamAction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

