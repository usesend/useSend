-- A new team's campaign waits for the Guard's check until reviewHoldUntil, and
-- guardStoppedAt marks one the Guard stopped. Nullable, so adding them is
-- instant, but it needs a brief lock on "Campaign": give up
-- after 3s rather than queue behind a long query. On failure the transaction
-- rolls back and the old deployment keeps serving. To retry: confirm neither
-- column exists, run `prisma migrate resolve --rolled-back
-- 20261122120000_campaign_review_hold`, then redeploy.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "guardStoppedAt" TIMESTAMP(3),
ADD COLUMN     "reviewHoldUntil" TIMESTAMP(3);

COMMIT;
