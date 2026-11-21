-- Adds the paused state to "Team" and a log of team actions. Nothing is
-- rewritten, so this runs in milliseconds, but adding the column needs a brief
-- exclusive lock on "Team", held until COMMIT. Give up after 3s rather than
-- queue behind a long query and hold up sending. On failure the transaction
-- rolls back, the old deployment keeps serving, and the migration can be
-- marked rolled back and retried.
BEGIN;
SET LOCAL lock_timeout = '3s';

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

COMMIT;
