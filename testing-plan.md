# Testing Implementation Tasks

## 1. Test Infrastructure

1.1 Create `apps/web/.env.test` mirroring required server env vars (Postgres, Redis, AWS shim, MinIO) and document secret sourcing.  
1.2 Add `docker/test/compose.yml` (or re-use `docker/dev/compose.yml` with overrides) spinning up Postgres 16, Redis 7, local SES/SNS shim, and MinIO without persistent volumes.  
1.3 Write CLI helpers under `scripts/` (`pnpm infra:test:start`, `pnpm infra:test:stop`) to bring containers up/down and export connection strings to `.env.test`.  
1.4 Ensure Prisma can target the test database: accept `DATABASE_URL_TEST`, update `apps/web/prisma/schema.prisma` instructions if needed, and confirm `prisma migrate deploy` + seed run during test bootstrap.  
1.5 Provide a teardown hook that truncates Postgres tables and flushes Redis between test suites (Vitest global teardown or script).

## 2. Vitest Configuration

2.1 Add dependencies in `apps/web/package.json`: `vitest`, `@vitest/coverage-v8`, `supertest`, `testcontainers`, `dotenv`, `tsx`, `whatwg-fetch` (for server utilities that use fetch), `@types/node` (already present).  
2.2 Create `apps/web/vitest.integration.config.ts` using `defineConfig` (node environment) with resolution alias for `~/*`, `globals: true`, `setupFiles: ["tests/integration/setup.ts"]`, coverage config, and `testDir` pointing to `tests/integration`.  
2.3 Add `apps/web/vitest.workspace.ts` that references the integration project (future-proof for additional suites).  
2.4 Introduce scripts: `pnpm --filter web test:integration` (Vitest), `test:infra:start`, `test:infra:stop`, and root-level `pnpm test:web:integration` convenience script.  
2.5 Wire Turbo (`turbo.json`) with `test-integration` task for the `web` package so CI can run `turbo run test-integration --filter=web`.

## 3. Global Test Harness

3.1 Implement `apps/web/tests/integration/setup.ts` to load `.env.test`, initialize Prisma (`import "~/env"`), start/await infra if not already running, run migrations + seeds, initialize BullMQ queues (`EmailQueueService.initializeQueue`), and register `beforeAll/afterAll` hooks.  
3.2 Add `apps/web/tests/integration/teardown.ts` to stop BullMQ workers, drain queues, close Prisma connections, and optionally stop `testcontainers` instances (if used instead of docker-compose).  
3.3 Create `apps/web/tests/helpers/prisma-fixtures.ts` with functions to create teams, domains, users, API keys, contact books, templates, etc., calling actual services (e.g., `addApiKey`) to exercise production logic.  
3.4 Build `apps/web/tests/helpers/public-api-client.ts` that wraps `getApp()` (from `src/server/public-api/index.ts`) and returns a `supertest` agent preloaded with Authorization headers from fixture API keys.  
3.5 Provide `apps/web/tests/helpers/queue.ts` utilities to wait for BullMQ job completion (using `QueueEvents`) and to drain queues/flush Redis between tests.

## 4. Seed & Fixture Data

4.1 Author `apps/web/prisma/seed.test.ts` (or reuse seed) that inserts baseline data: organization/team, admin user, verified domain, contact book, API key with full permissions, SES settings, and example template.  
4.2 Surface helper functions to generate signed API tokens by calling `addApiKey` so hashed token paths are verified.  
4.3 Store reusable SES/SNS webhook payload fixtures under `apps/web/tests/fixtures/ses/*.json`.  
4.4 Capture example campaign/contact import payloads for marketing scenarios.

## 5. Integration Test Suites

### 5.1 API Key & Domain Lifecycle

- Test adding a domain (TRPC router) → verifying via `POST /api/v1/domains`.  
- Assert SES shim receives CreateIdentity call, Prisma `Domain` row updates to `SUCCESS`, and `apiKey.lastUsed` refreshes.  
- Include negative cases (invalid token, mismatched team, redis failure).

### 5.2 Transactional Email Flow

- Use public API `POST /api/v1/emails` to send an email; expect `Email` + `EmailEvent` rows, job enqueued in transactional queue, worker calls `sendRawEmail` (local SES).  
- Fire webhook payload to `/api/ses_callback` and assert `Email.latestStatus` transitions through `SENT` → `DELIVERED`, `DailyEmailUsage` increments, and `SuppressionService` updates on bounce/complaint fixtures.

### 5.3 Marketing Campaign Scheduling

- Create contact book, insert contacts, craft template + campaign via TRPC.  
- Schedule campaign, run `CampaignSchedulerService.start()`, and verify batches populate the marketing queue respecting `batchWindowMinutes`.  
- Confirm resulting emails, campaign status changes, and analytics updates.

### 5.4 Rate Limiting & Auth

- Hit `/api/v1/emails` rapidly with valid token to exceed `team.apiRateLimit` (from DB).  
- Validate 429 response, `Retry-After` header, and Redis key TTL.  
- Ensure `/api/v1/doc` bypasses auth + rate limiter.  
- Include invalid/missing token cases for 401/403 coverage.

### 5.5 Suppression & Unsubscribe

- Seed unsubscribed contact, attempt marketing send → email stored with `latestStatus = SUPPRESSED`, log created.  
- Send SES complaint payload to confirm suppression list addition and subsequent send skipping suppressed recipient while allowing others.

### 5.6 SES Webhook Robustness

- Process duplicate webhook payloads, ensure idempotent updates (no duplicate events, `latestStatus` monotonic as per `parseSesHook`).  
- Validate fallback header lookup when `sesEmailId` missing.  
- Test complaint/bounce flows add suppression entries with correct `SuppressionReason`.

## 6. Developer Workflow & Docs

6.1 Add `apps/web/TESTING.md` detailing infra commands, environment expectations, data seeding, and how to run/interpret integration tests.  
6.2 Update root README or CONTRIBUTION guide with note about new backend integration suite and gating requirements.  
6.3 Provide troubleshooting section (ports already in use, docker not running, AWS shim logs).  
6.4 Add PR template checkbox: “Backend integration tests added/updated”.

## 7. CI Integration

7.1 Extend CI pipeline to run `pnpm test:web:integration` using service containers (Postgres, Redis, MinIO, SES shim).  
7.2 Cache `node_modules/.pnpm` between runs; ensure migrations run before tests.  
7.3 Publish coverage reports (text summary) and optionally upload to coverage service.  
7.4 Enforce failure if integration suite fails; consider marking as required check before merging.

## 8. Future Enhancements (Post-MVP)

8.1 Add smoke tests hitting SMTP proxy (`apps/smtp-server`) once backend suite stabilizes.  
8.2 Introduce contract tests for SDK (`packages/sdk`) to ensure it stays in sync with public API.  
8.3 Consider nightly long-running suite that pumps larger campaign volumes to validate queues under load.  
8.4 Explore `testcontainers` to remove docker-compose dependency for contributors without Docker Desktop.
