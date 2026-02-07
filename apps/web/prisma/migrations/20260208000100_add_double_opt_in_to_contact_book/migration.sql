-- AlterTable
ALTER TABLE "ContactBook"
ADD COLUMN "doubleOptInEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "doubleOptInSubject" TEXT,
ADD COLUMN "doubleOptInContent" TEXT;
