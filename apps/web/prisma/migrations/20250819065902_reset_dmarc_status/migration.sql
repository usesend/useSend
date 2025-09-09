-- Reset all dmarcAdded to false since previous verification logic was incorrect
-- DMARC should be checked on main domain, not subdomain
UPDATE "Domain" SET "dmarcAdded" = false WHERE "dmarcAdded" = true;