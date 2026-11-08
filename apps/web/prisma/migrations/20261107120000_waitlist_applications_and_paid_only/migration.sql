-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "freePlanAllowed" BOOLEAN NOT NULL DEFAULT false;

-- Existing teams keep the free plan; only teams created from now on need a paid plan to send.
UPDATE "Team" SET "freePlanAllowed" = true;

-- CreateTable
CREATE TABLE "WaitlistApplication" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "emailTypes" TEXT[],
    "emailVolume" TEXT NOT NULL,
    "listSource" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistApplication_userId_key" ON "WaitlistApplication"("userId");

-- CreateIndex
CREATE INDEX "WaitlistApplication_status_createdAt_idx" ON "WaitlistApplication"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "WaitlistApplication" ADD CONSTRAINT "WaitlistApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
