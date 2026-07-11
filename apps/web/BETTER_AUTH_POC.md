# Better Auth migration POC

## Outcome

The application auth surface has been migrated from NextAuth v4 to Better Auth
1.6.23 in this POC. GitHub, Google, email sign-in, server sessions, client session
hooks, sign-out, waitlist flags, admin detection, and numeric application user IDs
are represented.

Auth.js remains maintained for security and critical fixes, so this is not an
emergency security migration. The reason to continue is the stronger auth
primitives and more active feature path in Better Auth, not an assumption that
the current Auth.js release is abandoned.

## Security changes in the POC

- Replaces the five-character `Math.random()` email token with a six-digit OTP.
- Hashes OTPs at rest, expires them after five minutes, and permits three tries.
- Uses an atomic Redis-backed rate-limit counter for all Better Auth endpoints.
- Explicitly enables CSRF and trusted-origin checks, including in tests.
- Uses `HttpOnly`, `SameSite=Lax` Better Auth session cookies.
- Encrypts newly written OAuth access, refresh, and ID tokens.
- Stops using dangerous email-based OAuth account linking. Better Auth's verified
  provider/account-linking checks apply instead.

## Database compatibility

The existing `User` table and integer IDs remain authoritative, so `TeamUser`
and every other domain relation continue to point at the same users. Better Auth
field mappings reuse the existing account, session, and verification tables.

The Prisma schema includes the additive fields Better Auth requires. A database
migration was intentionally not generated or run in this POC. Before a deployed
cutover, create and review a Prisma migration that:

1. Adds the new nullable account token-expiry/password fields and timestamps.
2. Adds session IP/user-agent and timestamps.
3. Adds the verification ID and timestamps.
4. Adds `User.betterAuthEmailVerified` and `User.updatedAt`.
5. Backfills every new non-null timestamp before applying `NOT NULL` constraints.
6. Decides whether old Auth.js sessions should be deleted immediately or left to
   expire. Existing browser sessions cannot survive the cookie-name/protocol
   change, so users will sign in again either way.

The legacy `User.emailVerified` timestamp and Auth.js token-expiry columns are
left in place to make rollback possible. They can be removed in a later cleanup
after the Better Auth cutover is stable.

## Environment and provider configuration

Set a high-entropy `BETTER_AUTH_SECRET` of at least 32 characters and
`BETTER_AUTH_URL` to the public application origin. The POC temporarily falls
back to `NEXTAUTH_SECRET` and `NEXTAUTH_URL` to support a staged rollout.

GitHub and Google callback paths remain under `/api/auth/callback/<provider>`,
but they must be verified in both provider dashboards for every environment.

## Verification

Run the isolated, database-free auth E2E suite with:

```sh
pnpm test:web:e2e
```

It runs Better Auth through its real HTTP handler and an in-memory SQLite
database. The suite verifies OTP issuance, sign-in, cookie-backed session reads,
sign-out/revocation, cookie security attributes, and rejection of an untrusted
origin. Unit coverage also checks the legacy schema mappings and security
configuration.

The repository did not have Playwright or Cypress when this POC started. A full
browser E2E should be added after the reviewed Prisma migration is available so
it can exercise the actual login page and a migrated PostgreSQL database in CI.

## Recommended rollout

1. Review and generate the Prisma migration; test its backfills on a production
   snapshot.
2. Deploy the additive schema while Auth.js is still serving traffic.
3. Verify OAuth callbacks and email delivery in a staging environment.
4. Cut over to Better Auth and expect one forced sign-in per active user.
5. Monitor auth errors, OAuth-account matches, OTP delivery, and rate limits.
6. Keep the legacy columns for one rollback window, then remove them separately.
