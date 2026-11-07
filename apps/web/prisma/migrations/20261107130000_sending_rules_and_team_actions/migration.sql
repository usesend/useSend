-- CreateEnum
CREATE TYPE "TeamActionType" AS ENUM ('ALERT', 'PAUSE', 'RESUME', 'BLOCK', 'UNBLOCK');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "sendingPausedAt" TIMESTAMP(3);

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
ALTER TABLE "TeamAction" ADD CONSTRAINT "TeamAction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
