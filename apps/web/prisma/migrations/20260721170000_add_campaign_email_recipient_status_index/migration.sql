-- CreateIndex
-- Keep this as the migration's only SQL statement so PostgreSQL can build the
-- index without blocking inserts or updates.
CREATE INDEX CONCURRENTLY "CampaignEmail_campaignId_status_contactId_idx" ON "CampaignEmail"("campaignId", "status", "contactId");
