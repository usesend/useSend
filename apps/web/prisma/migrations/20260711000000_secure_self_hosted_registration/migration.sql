-- Persist instance-level authorization instead of treating every authenticated
-- self-hosted user as an administrator.
ALTER TABLE "User" ADD COLUMN "isInstanceAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Preserve access for existing installations by promoting the oldest team
-- administrator. Fall back to the oldest user for installations that have not
-- completed team setup yet.
-- Fresh installations have no users at migration time; their first user is
-- promoted atomically by the authentication adapter.
UPDATE "User"
SET "isInstanceAdmin" = true
WHERE "id" = (
  COALESCE(
    (
      SELECT u."id"
      FROM "User" u
      INNER JOIN "TeamUser" tu ON tu."userId" = u."id"
      WHERE tu."role" = 'ADMIN'
      ORDER BY u."createdAt" ASC, u."id" ASC
      LIMIT 1
    ),
    (
      SELECT "id"
      FROM "User"
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT 1
    )
  )
);

-- Existing invitations receive the same seven-day lifetime as new invites.
ALTER TABLE "TeamInvite" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "TeamInvite" SET "expiresAt" = "createdAt" + INTERVAL '7 days';
ALTER TABLE "TeamInvite" ALTER COLUMN "expiresAt" SET NOT NULL;
