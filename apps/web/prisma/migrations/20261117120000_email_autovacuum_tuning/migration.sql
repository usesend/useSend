-- Encourage autovacuum to visit "Email" sooner: after ~2% of its rows change
-- instead of the default 20%. The email content cleanup rewrites up to 100k
-- rows a night; this makes that space reusable sooner instead of the table
-- growing. It only changes a table setting and touches no data.
--
-- The ALTER needs a SHARE UPDATE EXCLUSIVE lock: normal reads and writes carry
-- on, but it waits for a running VACUUM, ANALYZE or CREATE INDEX CONCURRENTLY
-- on "Email". lock_timeout makes it give up after 10s instead of waiting
-- indefinitely during a deploy; the migration then fails and can be retried.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE "Email" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
COMMIT;
