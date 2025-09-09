-- Add dkimSelector column (nullable) with default 'usesend'
ALTER TABLE "Domain" ADD COLUMN "dkimSelector" TEXT;

-- Set existing rows to 'unsend' to preserve current selector
UPDATE "Domain" SET "dkimSelector" = 'unsend' WHERE "dkimSelector" IS NULL;

-- Set default for new rows to 'usesend'
ALTER TABLE "Domain" ALTER COLUMN "dkimSelector" SET DEFAULT 'usesend';

