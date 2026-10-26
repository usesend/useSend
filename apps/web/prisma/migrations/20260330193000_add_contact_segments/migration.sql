-- CreateTable
CREATE TABLE "ContactSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactBookId" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactSegment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "contactSegmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContactSegment_contactBookId_name_key" ON "ContactSegment"("contactBookId", "name");

-- CreateIndex
CREATE INDEX "ContactSegment_contactBookId_createdAt_idx" ON "ContactSegment"("contactBookId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Campaign_contactSegmentId_idx" ON "Campaign"("contactSegmentId");

-- AddForeignKey
ALTER TABLE "ContactSegment" ADD CONSTRAINT "ContactSegment_contactBookId_fkey" FOREIGN KEY ("contactBookId") REFERENCES "ContactBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_contactSegmentId_fkey" FOREIGN KEY ("contactSegmentId") REFERENCES "ContactSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
