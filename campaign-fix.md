## Campaign Scheduler — Simple, Reliable Plan

Goal: Fix memory bloat and avoid campaign clogging with a minimal, low‑risk scheduler that works in small batches and loops all active campaigns.

What we will do
1) Add columns to `Campaign`:
   - `scheduledAt` (DateTime?) — optional start time; if null, start immediately.
   - `batchSize` (Int, default 500)
   - `lastCursor` (String?, last processed `Contact.id`)
   - `lastSentAt` (DateTime?)

2) Add a composite index for fast existence checks (non-unique):
   - `Email` non-unique composite index on `(campaignId, contactId)`
   - Purpose: Speed up the pre-insert existence check. We will keep this non-unique by design and rely on an existence check in code.

3) Lightweight global scheduler (poll every 1–2s):
   - Query all active campaigns: `status IN (SCHEDULED, RUNNING)` and `(scheduledAt IS NULL OR scheduledAt <= now())`.
   - For each campaign, enqueue exactly one small job: `CampaignBatchJob { campaignId }`.
   - Redis idempotency for the batch job: use deterministic `jobId = campaign-batch:${campaignId}` so only one batch job per campaign can be queued/active at a time.
   - If a job with the same `jobId` already exists or is running, `add` will no-op/throw `JobExists`; catch and ignore.
   - This simple loop naturally interleaves work across campaigns → no one campaign hogs the workers.

4) Batch job (single worker function):
   - Load campaign, determine `batchSize` (use column or default).
   - Fetch next page of contacts with cursor paging:
     - `where: { contactBookId, subscribed: true }`
     - `orderBy: { id: asc }`, `take: batchSize`, `cursor` from `lastCursor` if present.
   - For each contact:
     - Check if an email already exists for `(campaignId, contactId)`; if yes, skip.
     - Otherwise render personalized HTML (using `EmailRenderer`), create `Email` row, and queue send via `EmailQueueService.queueEmail` (marketing queue).
     - Keep suppression logic (reuse existing `SuppressionService` checks before creating/queuing).
   - Update `campaign.lastCursor` to the last processed contact id and `campaign.lastSentAt = now()`.
   - If no contacts fetched, mark campaign as `SENT`.

   Redis idempotency for per-email jobs:
   - `EmailQueueService.queueEmail` already uses `jobId = email.id` — this ensures queue-level idempotency for downstream send jobs.
   - DB-level: use the composite index for a fast `find` before insert; we intentionally do not enforce a UNIQUE constraint.

5) Rate limiting (future-ready, minimal now):
   - We already store `lastSentAt` and `batchSize`. In future, a “per-hour limit” can be enforced by the scheduler: only enqueue a new `CampaignBatchJob` when the elapsed time since `lastSentAt` allows another `batchSize` to keep under the hourly cap (e.g., 1000/hr).

Design choices (kept intentionally simple)
- No inflight counters, no Redis sets, no per-campaign queues.
- Only one batch job per campaign per tick; fairness comes from the scheduler iterating all campaigns each poll.
- Job payload is minimal: just `{ campaignId }`. All heavy data is loaded inside the worker in small pages.
- Idempotency approach: DB lookup using the `(campaignId, contactId)` index before insert, plus queue-level idempotency with `jobId = email.id`.

Indexes and schema changes
- `Email`: add non-unique `@@index([campaignId, contactId])` (kept non-unique by design).
- `Contact`: add `@@index([contactBookId, id])` for cursor paging; avoid boolean in composite index.
- `Campaign`: add `scheduledAt DateTime?`, `batchSize Int @default(500)`, `lastCursor String?`, `lastSentAt DateTime?`.

Code changes (apps/web)
- `campaign-service.ts`
  - `sendCampaign(id)`: just pre-render HTML once, set `status = SCHEDULED`, initialize `batchSize` if null; don’t load all contacts or queue per-contact jobs.
  - New `queueCampaignBatch(campaignId)`: enqueue `CampaignBatchJob` (BullMQ; same Redis connection). Keep `removeOnComplete: true`.
  - New `processCampaignBatch(job)`: implements the batch job described above.

- `email-queue-service.ts`
  - No change to topology; keep marketing queue for actual email sends.

- Scheduler bootstrap (wherever we init workers)
  - Every 1–2s: `SELECT campaigns WHERE status IN (SCHEDULED, RUNNING) AND (scheduledAt IS NULL OR scheduledAt <= now())` → for each, call `queueCampaignBatch(campaign.id)`.
   - In `queueCampaignBatch`, call `campaignQueue.add(name, { campaignId }, { jobId: campaign-batch:${campaignId}, ...DEFAULT_QUEUE_OPTIONS })` and catch “job exists” to avoid duplicates.

Operational behavior
- Memory: no contact arrays are kept; only `batchSize` contacts per job.
- Redis: only a small job per campaign per tick; job data is tiny.
- Fairness: multiple campaigns proceed in parallel because we enqueue one batch for each on every tick.

Acceptance checklist
- Large campaigns do not spike memory (bounded batch fetch and render).
- Duplicate protection via unique `(campaignId, contactId)` works (attempted duplicates are skipped or upserted).
- Two campaigns scheduled together both progress concurrently without starving.
- Only one batch job per campaign exists at a time (verified by deterministic `jobId`).

Migration steps
1) Add fields to `Campaign`: `scheduledAt`, `batchSize`, `lastCursor`, `lastSentAt`.
2) Add composite (non-unique) index on `Email(campaignId, contactId)`.
3) Add index on `Contact(contactBookId, id)` for faster page scans.
4) Add index on `Campaign(status, scheduledAt)` to speed up scheduler query.

Campaign status model (simple and explicit)
- Enum values: `DRAFT`, `SCHEDULED`, `RUNNING`, `PAUSED`, `SENT`.
- Lifecycle:
  - `DRAFT` → `SCHEDULED`: user schedules campaign (optionally with `scheduledAt`).
  - Scheduler sees `SCHEDULED`, enqueues first batch, and sets status to `RUNNING` when the first batch job starts.
  - While `RUNNING`, each batch advances `lastCursor`; when no more contacts, set status to `SENT`.
  - `PAUSED`: if set, scheduler skips the campaign; resume by switching back to `SCHEDULED` or `RUNNING`.

Schema changes for status
- Update Prisma `CampaignStatus` enum to: `DRAFT, SCHEDULED, RUNNING, PAUSED, SENT`.
- Keep `SENT` as the terminal state (no renaming/mapping needed).
- `scheduledAt` added to Campaign for deferred start; cadence limiting (e.g., 1000/hr) will be driven later via `batchSize` + `lastSentAt` windows.

FAQ / Concurrency notes
- What if the previous batch job hasn’t finished when the scheduler ticks again?
  - The scheduler enqueues with `jobId = campaign-batch:${campaignId}`. If a job is already queued/active, BullMQ rejects the new one; we ignore that and move on. Result: at most one batch in-flight per campaign.
- What if a batch crashes after creating some `Email` rows but before updating `lastCursor`?
  - On the next run we may re-scan the same range, but the pre-insert existence check using the `(campaignId, contactId)` index and per-email `jobId = email.id` ensure duplicates are skipped. We then advance the cursor and continue.
- Do we need to track inflight jobs or add locks?
  - Not necessary. The fixed `jobId` per campaign provides enough Redis-level idempotency. As an optional extra hardening, we can set a short TTL lock `SETNX lock:campaign:${campaignId}` at batch start and release it at end, but it’s not required for correctness.

Defaults
- `batchSize`: 500 (env overrideable later).
- scheduler tick: 1000–2000 ms.

Summary
This keeps it simple: a tiny scheduler loops all active campaigns and enqueues one batch job per campaign. The batch job pages contacts, renders, and queues emails while relying on an indexed database lookup (campaignId+contactId) to ensure idempotency. No extra queue orchestration or inflight accounting is needed.
