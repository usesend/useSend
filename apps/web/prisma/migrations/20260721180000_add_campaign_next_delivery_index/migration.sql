-- CreateIndex
-- Keep this as the migration's only SQL statement so PostgreSQL can build the
-- index without blocking inserts or updates.
CREATE INDEX CONCURRENTLY "Campaign_status_nextDeliveryAt_idx" ON "Campaign"("status", "nextDeliveryAt");
