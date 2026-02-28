-- AlterTable
ALTER TABLE "ContactBook"
ADD COLUMN "doubleOptInEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "doubleOptInSubject" TEXT,
ADD COLUMN "doubleOptInContent" TEXT;

-- Backfill legacy unsubscribed contacts so pending state can rely on NULL
UPDATE "Contact"
SET "unsubscribeReason" = 'UNSUBSCRIBED'
WHERE "subscribed" = false
  AND "unsubscribeReason" IS NULL;
