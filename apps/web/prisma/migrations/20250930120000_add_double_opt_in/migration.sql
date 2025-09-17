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

-- Seed default double opt-in template per team when missing
INSERT INTO "Template" (
  "id",
  "name",
  "teamId",
  "subject",
  "html",
  "content",
  "createdAt",
  "updatedAt"
)
SELECT
  'doi_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  'Double Opt In',
  t.id,
  'Confirm your email',
  '<p>Hey there,</p><p>Welcome to [Product name]. Please click the link below to verify your email address to get started.</p><p><a href="{{verificationUrl}}" style="display:inline-block;padding:12px 24px;border-radius:4px;border-width:1px;border-style:solid;border-color:#000;background-color:#000;color:#fff;text-decoration:none;">Confirm</a></p><p>Best</p>',
  '{"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"Hey there,"}]},{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"Welcome to [Product name]. Please click the link below to verify your email address to get started."}]},{"type":"paragraph","attrs":{"textAlign":null}},{"type":"button","attrs":{"component":"button","text":"Confirm","url":"{{verificationUrl}}","alignment":"left","borderRadius":"4","borderWidth":"1","buttonColor":"rgb(0, 0, 0)","borderColor":"rgb(0, 0, 0)","textColor":"rgb(255, 255, 255)"}},{"type":"paragraph","attrs":{"textAlign":null}},{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"Best"}]}]}',
  NOW(),
  NOW()
FROM "Team" t
WHERE NOT EXISTS (
  SELECT 1
  FROM "Template"
  WHERE "Template"."teamId" = t.id
    AND "Template"."name" = 'Double Opt In'
);
