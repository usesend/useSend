-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'REPLIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackReplyStatus" AS ENUM ('SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "teamId" INTEGER,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "teamName" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "clientKey" TEXT,
    "externalId" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackReply" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "deliveryStatus" "FeedbackReplyStatus" NOT NULL DEFAULT 'SENDING',
    "attemptId" TEXT,
    "attemptStartedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_clientKey_key" ON "Feedback"("clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_externalId_key" ON "Feedback"("externalId");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackReply_idempotencyKey_key" ON "FeedbackReply"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FeedbackReply_feedbackId_idx" ON "FeedbackReply"("feedbackId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReply" ADD CONSTRAINT "FeedbackReply_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

