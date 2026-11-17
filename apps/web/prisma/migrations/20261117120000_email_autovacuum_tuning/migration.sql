-- Vacuum "Email" after ~2% of its rows change instead of the default 20%.
-- The email content cleanup rewrites up to 100k rows a night; this lets
-- autovacuum make that space reusable before the next night, instead of the
-- table growing. Only changes a table setting; no data is touched, and reads
-- and writes aren't blocked.
ALTER TABLE "Email" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
