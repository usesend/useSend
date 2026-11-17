-- CreateIndex
-- Built CONCURRENTLY so sending isn't blocked while it builds on a large
-- "Email" table. CONCURRENTLY can't run inside a transaction, so this must be
-- the only statement in the file. IF NOT EXISTS: on useSend cloud the index was
-- created by hand before this shipped.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Email_teamId_domainId_createdAt_idx" ON "Email"("teamId", "domainId", "createdAt" DESC);
