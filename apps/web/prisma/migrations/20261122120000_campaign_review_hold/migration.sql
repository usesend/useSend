-- A new team's campaign waits for the Guard's check until this time. Nullable,
-- so adding it is instant, but it needs a brief lock on "Campaign": give up
-- after 3s rather than queue behind a long query. On failure the transaction
-- rolls back, the old deployment keeps serving, and it can be retried.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "reviewHoldUntil" TIMESTAMP(3);

COMMIT;
