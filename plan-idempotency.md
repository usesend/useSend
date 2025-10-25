# Idempotency Keys for Email Send (Single + Bulk)

This plan introduces idempotency for the public API email send endpoints. When an `Idempotency-Key` is provided:
- If the key is new, the request proceeds and the resulting email id(s) are cached in Redis for 24h.
- If the key already exists, the API does not send again and returns the same email id(s) as previously created.

Keys are stored in Redis; the value will include a canonicalized request body (or its hash) to compare future requests, and the created email id(s), with a 24h TTL.


## Goals
- Prevent duplicate email sends for the same client request (network retries, client retries, race conditions) using a client-supplied idempotency key.
- Support both single send (`POST /v1/emails`) and bulk send (`POST /v1/emails/batch`).
- Keep responses backward‑compatible: on a hit, return the same response shape with the prior email id(s).
- Minimal surface changes: introduce an optional `Idempotency-Key` request header and SDK convenience options.




## API Contract Changes
- Header: `Idempotency-Key` (optional, string, 1–256 chars)
- Endpoints affected:
  - POST `/v1/emails`
  - POST `/v1/emails/batch`
- Semantics:
  - On first request with a new key: process normally, cache result in Redis as array of email IDs, TTL 24h, then return 200 as today.
  - On subsequent request with the same key within TTL: do not enqueue or send again; return 200 with the same `emailId` for single or the same array for bulk.
  - If a concurrent request arrives while the first is still in flight: use a short Redis lock to serialize the operation; if lock cannot be acquired and no cached result yet, return a 409 with a retry hint (see Error Behavior) or poll briefly and then return.


## Redis Schema
- Keys
  - `idem:{teamId}:{key}` -> JSON string object containing canonical payload or hash, and email IDs; EX 24h.
  - `idemlock:{teamId}:{key}` -> ephemeral lock to prevent duplicate in-flight sends; EX 60s.
- TTL
  - Result key: 24 hours (86,400 seconds)
  - Lock key: 60 seconds (configurable constant)
- Value format (body-compare capable)
  - `{ bodyHash: string, emailIds: string[] }`
  - Optional for debugging: `{ body: string, emailIds: string[] }` where `body` is canonical JSON string; recommended to prefer `bodyHash` to keep values compact and avoid storing large HTML.


## Server Implementation Plan
1. Common util (service level)
   - Add `IdempotencyService` with helpers using existing Redis client (`getRedis`):
     - `getResult(teamId: number, key: string): Promise<string[] | null>`
     - `setResult(teamId: number, key: string, emailIds: string[]): Promise<void>` (EX 24h)
     - `acquireLock(teamId: number, key: string): Promise<boolean>` (`SET NX EX 60`)
     - `releaseLock(teamId: number, key: string): Promise<void>` (best-effort `DEL`)
   - Constants: `IDEMPOTENCY_RESULT_TTL_SECONDS = 86400`, `IDEMPOTENCY_LOCK_TTL_SECONDS = 60`.

2. Single send endpoint
   - File: apps/web/src/server/public-api/api/emails/send-email.ts
   - Read optional `Idempotency-Key` from request headers; validate basic length.
   - If present, compute canonical request body and hash (see Canonicalization) and check Redis via `getResult(team.id, key)`:
     - If found and `stored.bodyHash === current.bodyHash`: return 200 `{ emailId: stored.emailIds[0] }`.
     - If found and body hash mismatches: return 409 Conflict with message like "Idempotency-Key reused with a different payload" (no send).
     - Else, try `acquireLock`; if lock not acquired and result still not present:
       - Option A: short wait/poll (e.g., up to 2–3 seconds) for result to appear, then return if found.
       - Option B: return 409 Conflict with body `{ code: "NOT_UNIQUE", message: "Request with same Idempotency-Key is in progress. Retry later.", retryAfterSeconds: 2 }`.
     - On lock acquired: proceed to call `sendEmail(...)`; after success, store result as `setResult(team.id, key, { bodyHash, emailIds: [email.id] })`, then `releaseLock`.
     - On failure: `releaseLock` and bubble error.
   - OpenAPI docs: add header param to route definition so docs render in Mintlify.

3. Bulk send endpoint
   - File: apps/web/src/server/public-api/api/emails/batch-email.ts
   - Same header handling as above. Build canonicalization over the entire request body (batch array) and compute a single `bodyHash` for the full payload.
   - On cache hit:
     - If `stored.bodyHash === current.bodyHash`: return `{ data: stored.emailIds.map((id) => ({ emailId: id })) }`.
     - Else: return 409 Conflict as above.
   - On miss: acquire lock, call `sendBulkEmails(...)`, collect returned emails’ IDs in original order, cache `{ bodyHash, emailIds }`, release lock, return as usual.

4. Service layer (no behavioral change needed beyond calling order)
   - No changes in `sendEmail`/`sendBulkEmails` logic; idempotency is enforced in the API handlers, not deep inside service. This ensures other internal callers can opt-in later explicitly if needed.

5. Logging and metrics
   - Log at `info` on idempotency hit with teamId/key, and at `warn` if lock contention is detected.
   - Optionally export counters: hits, misses, lock-contention, failures.

6. Configuration
   - Reuse existing Redis connection (`apps/web/src/server/redis.ts`).
   - TTLs as constants colocated with IdempotencyService; optionally env-overridable in the future.

7. Error behavior
  - 409 Conflict for two scenarios:
    - `NOT_UNIQUE` when key exists with a different payload (body mismatch).
    - `NOT_UNIQUE` when a request with the same key is in progress and no result yet (client may retry shortly).
  - This path is rare and only occurs on truly concurrent requests before the first finishes and writes cache.

### Canonicalization
- Build a stable representation of the request body before hashing:
  - Sort object keys recursively; omit `react` fields (TS SDK-only helper).
  - Normalize `html` field: ensure it’s a string or undefined (align with current route pre-processing).
  - Normalize `text` as string or undefined; `scheduledAt` to ISO string; `replyTo` to array form.
  - Preserve array order for `to`, `cc`, `bcc` (order affects hash by design).
  - Remove undefined/null fields consistently so semantically equivalent payloads produce the same hash.
  - Hash function: SHA-256 over the canonical JSON string.


## SDK Changes

### TypeScript SDK (packages/sdk)
- Add per-request headers support in `UseSend`:
  - Extend `post/get/patch/...` to accept optional `{ headers?: Record<string, string> }` merged with defaults.
- Emails client changes (`packages/sdk/src/email.ts`):
  - Overload `create(payload, options?)` where `options?: { idempotencyKey?: string }` and forward header.
  - Same for `batch(payload, options?)`.
  - Note: SDK does not compute or compare hashes; server is source of truth. Clients only pass the key.
- README updates with examples:
  - Single send with `idempotencyKey`.
  - Batch send with `idempotencyKey`.

### Python SDK (packages/python-sdk)
- Add per-request header override support in client:
  - Update `UseSend._request` and `post/patch/...` to accept optional `headers: Dict[str, str]` merged over `self.headers`.
- Emails client changes (`usesend/emails.py`):
  - `create(payload, idempotency_key: Optional[str] = None)` and `batch(payload, idempotency_key: Optional[str] = None)`.
  - If provided, pass `headers={"Idempotency-Key": idempotency_key}` to `UseSend.post`.
- README updates with minimal examples.


## Documentation Updates (Mintlify)
- Auto-generated API reference will include the header once we annotate the OpenAPI route definitions.
- Add short usage notes to the MDX pages:
  - `apps/docs/api-reference/emails/send-email.mdx`
  - `apps/docs/api-reference/emails/batch-email.mdx`
- Explicitly document behavior:
  - If an `Idempotency-Key` is reused with the exact same request body (as per server canonicalization), the API returns 200 with the previous result.
  - If the key is reused with a different body, the API returns 409 Conflict with a descriptive error.
  - If a request with the same key is currently in progress, the API may return 409 Conflict; retry after a short delay.
- New guide section (optional but recommended):
  - A brief "Idempotency" page under API Reference or Guides explaining semantics, TTL, and best practices.


## Verification Plan
- Unit-ish/integration checks locally:
  - First request with key -> sends and caches; second request with same key within 24h -> returns same ID(s) without sending again.
  - Confirm Redis keys exist (`idem:teamId:key`) with value as JSON array and TTL approx 24h.
  - Concurrency test: fire two requests with same key nearly simultaneously; exactly one send occurs; the other returns cached result or 409 if truly concurrent before cache write.
  - Bulk path preserves order of returned IDs and caches the same order.
  - Missing/empty/oversized keys are ignored or rejected with 400 if invalid length.


## Backward Compatibility
- Header is optional; no behavior change for clients not using it.
- Response shapes unchanged.


## Rollout
- Ship server changes behind no flag (safe default, opt-in via header).
- Release TypeScript and Python SDK minor versions documenting the new options.
- Announce in changelog, add brief doc note linking to examples.


## Implementation Checklist (files to touch)
- Server
  - apps/web/src/server/public-api/api/emails/send-email.ts
  - apps/web/src/server/public-api/api/emails/batch-email.ts
  - apps/web/src/server/service/idempotency-service.ts (new)
- SDKs
  - packages/sdk/src/usesend.ts
  - packages/sdk/src/email.ts
  - packages/sdk/README.md
  - packages/python-sdk/usesend/usesend.py
  - packages/python-sdk/usesend/emails.py
  - packages/python-sdk/README.md
- Docs
  - apps/docs/api-reference/emails/send-email.mdx
  - apps/docs/api-reference/emails/batch-email.mdx
  - apps/docs/api-reference/introduction.mdx (add brief mention / link) [optional]


## Open Questions
- Do we want to return 409 on in-flight requests or block briefly (poll) to return 200 with the cached result as soon as it is available? Default in this plan: prefer quick 409 with a short retry hint.
- Do we need to enforce a stricter max key length or specific character set? Proposed: 1–256 chars and printable ASCII.
