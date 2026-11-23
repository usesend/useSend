-- The Guard's advice on a waitlist application, shown next to the Let in and
-- Reject buttons. Nullable, so adding them is instant; the table is small.
-- Give up after 3s rather than queue behind a long query. On failure the
-- transaction rolls back and the old deployment keeps serving. To retry:
-- confirm neither column exists, run `prisma migrate resolve --rolled-back
-- 20261123120000_waitlist_guard_verdict`, then redeploy.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- AlterTable
ALTER TABLE "WaitlistApplication" ADD COLUMN     "guardNote" TEXT,
ADD COLUMN     "guardVerdict" TEXT;

COMMIT;
