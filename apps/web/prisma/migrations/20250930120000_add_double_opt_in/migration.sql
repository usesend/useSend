-- Add double opt-in supporting columns
ALTER TABLE "Domain" ADD COLUMN "defaultFrom" TEXT;

ALTER TABLE "ContactBook"
  ADD COLUMN "defaultDomainId" INTEGER,
  ADD COLUMN "doubleOptInEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doubleOptInTemplateId" TEXT;

-- Indexes for new foreign keys
CREATE INDEX "ContactBook_defaultDomainId_idx" ON "ContactBook"("defaultDomainId");
CREATE INDEX "ContactBook_doubleOptInTemplateId_idx" ON "ContactBook"("doubleOptInTemplateId");

-- Foreign key constraints
ALTER TABLE "ContactBook"
  ADD CONSTRAINT "ContactBook_defaultDomainId_fkey" FOREIGN KEY ("defaultDomainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactBook"
  ADD CONSTRAINT "ContactBook_doubleOptInTemplateId_fkey" FOREIGN KEY ("doubleOptInTemplateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
