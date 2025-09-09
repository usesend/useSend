-- Seed data for a photogenic dashboard screenshot
-- Postgres SQL compatible with the Prisma schema in apps/web/prisma/schema.prisma
-- Usage:
--   psql "$DATABASE_URL" -f apps/web/prisma/seed_dashboard.sql

BEGIN;

-- 1) Create a team (allow duplicates for demo runs)
INSERT INTO "Team" ("name", "plan", "isActive", "apiRateLimit", "createdAt", "updatedAt")
VALUES ('Acme Inc', 'BASIC'::"Plan", TRUE, 10, NOW(), NOW());

-- 2) Ensure a verified domain for that team (upsert by unique name)
INSERT INTO "Domain" (
  "name", "teamId", "status", "region", "clickTracking", "openTracking",
  "publicKey", "dkimSelector", "dmarcAdded", "createdAt", "updatedAt"
)
SELECT
  'mail.acme.test', id, 'SUCCESS'::"DomainStatus", 'us-east-1', TRUE, TRUE,
  'PUBLIC_KEY_SAMPLE', 'usesend', TRUE, NOW(), NOW()
FROM "Team"
WHERE "name" = 'Acme Inc'
ORDER BY id DESC
LIMIT 1
ON CONFLICT ("name") DO UPDATE
SET "updatedAt" = NOW();

-- 3) Cumulated totals to power headline KPIs (idempotent)
INSERT INTO "CumulatedMetrics" ("teamId", "domainId", "delivered", "hardBounced", "complained")
SELECT d."teamId", d.id, 125000, 750, 180
FROM "Domain" d
WHERE d."name" = 'mail.acme.test'
ON CONFLICT ("teamId", "domainId") DO UPDATE
SET "delivered" = EXCLUDED."delivered",
    "hardBounced" = EXCLUDED."hardBounced",
    "complained" = EXCLUDED."complained";

-- 4) 14 days of daily usage (TRANSACTIONAL) with internally consistent metrics
INSERT INTO "DailyEmailUsage" (
  "teamId", "domainId", "date", "type",
  "sent", "delivered", "opened", "clicked",
  "bounced", "complained", "hardBounced",
  "createdAt", "updatedAt"
)
SELECT
  d."teamId",
  d.id AS "domainId",
  TO_CHAR((CURRENT_DATE - i)::date, 'YYYY-MM-DD') AS date,
  'TRANSACTIONAL'::"EmailUsageType" AS type,
  s.sent,
  s.delivered,
  s.opened,
  s.clicked,
  s.bounced,
  s.complained,
  s.hardBounced,
  NOW() - (i || ' days')::interval   AS createdAt,
  NOW() - (i || ' days')::interval   AS updatedAt
FROM (
  SELECT id, "teamId" FROM "Domain" WHERE "name" = 'mail.acme.test' LIMIT 1
) d,
generate_series(0, 13) AS i,
LATERAL (
  WITH season AS (
    SELECT
      CASE EXTRACT(DOW FROM (CURRENT_DATE - i))
        WHEN 0 THEN 0.80 -- Sunday
        WHEN 6 THEN 0.85 -- Saturday
        ELSE 1.00        -- Weekday
      END AS dow_factor,
      (1.0 + 0.06 * sin(2*pi() * ((13 - i)::float / 7.0))) AS wave
  ), base AS (
    SELECT
      GREATEST(700, round((900 * dow_factor * wave) + 30*random()))::int AS sent_base
    FROM season
  ), parts AS (
    SELECT
      sent_base AS sent,
      (0.006 + random()*0.007) AS bounce_frac
    FROM base
  )
  SELECT
    sent,
    (sent - floor(sent*bounce_frac)::int)                         AS delivered,
    floor((sent - floor(sent*bounce_frac)::int) * (0.60 + random()*0.15))::int AS opened,
    LEAST(
      floor((sent - floor(sent*bounce_frac)::int) * (0.18 + random()*0.12))::int,
      floor((sent - floor(sent*bounce_frac)::int) * 0.95)::int
    )                                                            AS clicked,
    floor(sent*bounce_frac)::int                                  AS bounced,
    CASE WHEN random() < ((sent - floor(sent*bounce_frac)::int) * (0.0001 + random()*0.0002))
      THEN 1 ELSE 0 END                                           AS complained,
    floor(floor(sent*bounce_frac)::int * (0.60 + random()*0.25))::int AS hardBounced
  FROM parts
) s
ON CONFLICT ("teamId", "domainId", "date", "type") DO NOTHING;

-- 5) 14 days of daily usage (MARKETING) with consistent metrics
INSERT INTO "DailyEmailUsage" (
  "teamId", "domainId", "date", "type",
  "sent", "delivered", "opened", "clicked",
  "bounced", "complained", "hardBounced",
  "createdAt", "updatedAt"
)
SELECT
  d."teamId",
  d.id AS "domainId",
  TO_CHAR((CURRENT_DATE - i)::date, 'YYYY-MM-DD') AS date,
  'MARKETING'::"EmailUsageType" AS type,
  s.sent,
  s.delivered,
  s.opened,
  s.clicked,
  s.bounced,
  s.complained,
  s.hardBounced,
  NOW() - (i || ' days')::interval   AS createdAt,
  NOW() - (i || ' days')::interval   AS updatedAt
FROM (
  SELECT id, "teamId" FROM "Domain" WHERE "name" = 'mail.acme.test' LIMIT 1
) d,
generate_series(0, 13) AS i,
LATERAL (
  WITH season AS (
    SELECT
      CASE EXTRACT(DOW FROM (CURRENT_DATE - i))
        WHEN 0 THEN 0.75 -- Sunday
        WHEN 6 THEN 0.85 -- Saturday
        ELSE 1.00
      END AS dow_factor,
      (1.0 + 0.08 * sin(2*pi() * ((13 - i)::float / 7.0) + 0.6)) AS wave
  ), base AS (
    SELECT
      GREATEST(500, round((700 * dow_factor * wave) + 40*random()))::int AS sent_base
    FROM season
  ), parts AS (
    SELECT
      sent_base AS sent,
      (0.008 + random()*0.010) AS bounce_frac
    FROM base
  )
  SELECT
    sent,
    (sent - floor(sent*bounce_frac)::int)                         AS delivered,
    floor((sent - floor(sent*bounce_frac)::int) * (0.47 + random()*0.18))::int AS opened,
    LEAST(
      floor((sent - floor(sent*bounce_frac)::int) * (0.14 + random()*0.10))::int,
      floor((sent - floor(sent*bounce_frac)::int) * 0.90)::int
    )                                                            AS clicked,
    floor(sent*bounce_frac)::int                                  AS bounced,
    CASE WHEN random() < ((sent - floor(sent*bounce_frac)::int) * (0.00005 + random()*0.00020))
      THEN 1 ELSE 0 END                                           AS complained,
    floor(floor(sent*bounce_frac)::int * (0.60 + random()*0.25))::int AS hardBounced
  FROM parts
) s
ON CONFLICT ("teamId", "domainId", "date", "type") DO NOTHING;

-- 6) A recent campaign with healthy open/click, realistic bounce/complaint rates
INSERT INTO "Campaign" (
  id, "name", "teamId", "from", cc, bcc, "replyTo", "domainId", subject, "previewText",
  html, content, "contactBookId", total, sent, delivered, opened, clicked, unsubscribed,
  bounced, "hardBounced", complained, status, "createdAt", "updatedAt"
)
SELECT
  ('cmp_' || substr(md5(random()::text), 1, 12)) AS id,
  'August Promo – Back to Business' AS name,
  d."teamId" AS teamId,
  'Acme <noreply@mail.acme.test>' AS "from",
  ARRAY[]::text[] AS cc,
  ARRAY[]::text[] AS bcc,
  ARRAY['support@acme.test']::text[] AS "replyTo",
  d.id AS "domainId",
  'Save 30% on Pro' AS subject,
  'Limited-time offer for power users' AS "previewText",
  '<h1>Upgrade to Pro</h1><p>Unlock advanced features.</p>' AS html,
  NULL AS content,
  NULL AS "contactBookId",
  25000 AS total,
  24800 AS sent,
  24500 AS delivered,
  13600 AS opened,
  6200 AS clicked,
  90 AS unsubscribed,
  300 AS bounced,
  220 AS "hardBounced",
  5 AS complained,
  'SENT'::"CampaignStatus" AS status,
  NOW() - interval '2 days' AS "createdAt",
  NOW() - interval '1 days' AS "updatedAt"
FROM "Domain" d
JOIN "Team" t2 ON t2.id = d."teamId"
WHERE d."name" = 'mail.acme.test'
ORDER BY d.id DESC
LIMIT 1;

-- 7) A handful of recent emails (varied statuses) to make lists look alive
DO $$
DECLARE
  v_team_id   INT;
  v_domain_id INT;
BEGIN
  SELECT t.id, d.id INTO v_team_id, v_domain_id
  FROM "Team" t
  JOIN "Domain" d ON d."teamId" = t.id
  WHERE d."name" = 'mail.acme.test'
  ORDER BY d.id DESC
  LIMIT 1;

  -- delivered/opened
  INSERT INTO "Email" (
    id, "sesEmailId", "from", "to", "replyTo", cc, bcc, subject, text, html,
    "latestStatus", "teamId", "domainId", "createdAt", "updatedAt"
  ) VALUES (
    ('eml_' || substr(md5(random()::text), 1, 12)), NULL,
    'Acme <noreply@mail.acme.test>', ARRAY['user1@example.com'], ARRAY['support@acme.test'], ARRAY[]::text[], ARRAY[]::text[],
    'Welcome to Acme', 'Plaintext welcome', '<p>Welcome!</p>', 'OPENED'::"EmailStatus",
    v_team_id, v_domain_id, NOW() - interval '4 hours', NOW() - interval '3 hours'
  );

  -- clicked
  INSERT INTO "Email" (
    id, "sesEmailId", "from", "to", "replyTo", cc, bcc, subject, text, html,
    "latestStatus", "teamId", "domainId", "createdAt", "updatedAt"
  ) VALUES (
    ('eml_' || substr(md5(random()::text), 1, 12)), NULL,
    'Acme <noreply@mail.acme.test>', ARRAY['user2@example.com'], ARRAY['support@acme.test'], ARRAY[]::text[], ARRAY[]::text[],
    'Get Started Guide', NULL, '<p>Click to learn more</p>', 'CLICKED'::"EmailStatus",
    v_team_id, v_domain_id, NOW() - interval '2 hours', NOW() - interval '1 hour'
  );

  -- bounced
  INSERT INTO "Email" (
    id, "sesEmailId", "from", "to", "replyTo", cc, bcc, subject, text, html,
    "latestStatus", "teamId", "domainId", "createdAt", "updatedAt"
  ) VALUES (
    ('eml_' || substr(md5(random()::text), 1, 12)), NULL,
    'Acme <noreply@mail.acme.test>', ARRAY['bad@invalid.test'], ARRAY['support@acme.test'], ARRAY[]::text[], ARRAY[]::text[],
    'Delivery failed notice', NULL, '<p>Delivery failed</p>', 'BOUNCED'::"EmailStatus",
    v_team_id, v_domain_id, NOW() - interval '6 hours', NOW() - interval '5 hours'
  );

  -- complained
  INSERT INTO "Email" (
    id, "sesEmailId", "from", "to", "replyTo", cc, bcc, subject, text, html,
    "latestStatus", "teamId", "domainId", "createdAt", "updatedAt"
  ) VALUES (
    ('eml_' || substr(md5(random()::text), 1, 12)), NULL,
    'Acme <noreply@mail.acme.test>', ARRAY['too.sensitive@example.com'], ARRAY['support@acme.test'], ARRAY[]::text[], ARRAY[]::text[],
    'Feedback request', 'We value your feedback', '<p>Please reply</p>', 'COMPLAINED'::"EmailStatus",
    v_team_id, v_domain_id, NOW() - interval '9 hours', NOW() - interval '8 hours'
  );
END $$;

COMMIT;
