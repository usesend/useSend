-- CreateIndex
-- Keep this as the migration's only SQL statement so Prisma runs it outside a
-- transaction and PostgreSQL can build it without blocking inserts or updates.
CREATE INDEX CONCURRENTLY "Email_campaignId_latestStatus_idx" ON "Email"("campaignId", "latestStatus");
