# Custom Tracking Domain Implementation Plan (Option 2: Self-Hosted Tracking Proxy)

## Why NOT Option 1 (SES `CustomRedirectDomain`)

The original plan proposed using `PutConfigurationSetTrackingOptionsCommand` to set per-domain custom redirect domains on SES Configuration Sets. **This doesn't work for cloud/multi-tenant** because:

- UseSend creates **4 shared configuration sets per region** (general, click, open, full)
- All domains in a region share these config sets
- Setting `CustomRedirectDomain` on a config set affects **every email** sent through it
- You'd need a separate config set per domain that wants custom tracking — AWS limits this to 10,000 config sets per account, and managing them becomes a nightmare

## Solution: Self-Hosted Tracking Proxy

Build our own click tracking and open tracking proxy. This is how SendGrid, Postmark, and Mailgun actually work. UseSend takes full control of:

1. **Link rewriting** — replace links in outgoing HTML with tracked redirect URLs
2. **Open pixel injection** — inject a 1x1 tracking pixel into outgoing HTML
3. **Redirect/pixel endpoint** — serve redirects for clicks and transparent pixels for opens
4. **Custom domain routing** — users point their tracking subdomain (CNAME) at UseSend's tracking endpoint

**This completely decouples tracking from SES Configuration Sets.** SES just sends the email — all tracking intelligence lives in UseSend.

---

## Architecture Overview

```
OUTGOING EMAIL FLOW:
┌──────────────────────────────────────────────────────────┐
│  Email HTML                                              │
│  <a href="https://example.com/pricing">Click</a>        │
│                                                          │
│  ──── Link Rewriter ────►                                │
│                                                          │
│  <a href="https://track.customer.com/t/c/abc123">Click</a>│
│  <img src="https://track.customer.com/t/o/abc123" />     │
│                                                          │
│  ──── SES sends raw email (no SES click/open tracking) ──►│
└──────────────────────────────────────────────────────────┘

INCOMING CLICK/OPEN FLOW:
┌──────────────────────────────────────────────────────────┐
│  Recipient clicks: https://track.customer.com/t/c/abc123 │
│                                                          │
│  DNS: track.customer.com CNAME → track.usesend.com       │
│                                                          │
│  UseSend tracking endpoint:                              │
│    1. Decode abc123 → emailId + original URL             │
│    2. Record click event (EmailEvent + metrics)          │
│    3. HTTP 302 redirect to original URL                  │
│                                                          │
│  Open pixel loaded: https://track.customer.com/t/o/abc123│
│    1. Decode abc123 → emailId                            │
│    2. Record open event                                  │
│    3. Return 1x1 transparent GIF                         │
└──────────────────────────────────────────────────────────┘
```

**Key insight:** When `clickTracking` or `openTracking` is enabled on a domain, we **stop using SES config sets with CLICK/OPEN events** and use only the `configGeneral` set. All tracking is handled by our proxy.

---

## Task 1: Database Schema Changes

**File:** `apps/web/prisma/schema.prisma`

### 1.1 Add Tracking Domain Fields to Domain Model

```prisma
model Domain {
  // ... existing fields ...

  // Custom tracking domain (e.g., "track.example.com")
  // If null, uses the app's default URL for tracking endpoints
  trackingDomain           String?
  trackingDomainStatus     DomainStatus  @default(NOT_STARTED)
  trackingDomainError      String?
  trackingDomainVerifiedAt DateTime?
}
```

### 1.2 Add ClickedUrl Model for Link Tracking

We need a table to map short tracking IDs to original URLs and associate them with emails:

```prisma
model TrackedLink {
  id        String   @id @default(cuid())
  emailId   String
  url       String   // Original destination URL
  position  Int      // Position of the link in the email (for deduplication)
  createdAt DateTime @default(now())

  @@index([emailId])
}
```

**Why a separate table?** Each email can have many links, and we need to map tracking IDs back to specific original URLs. Encoding the URL directly into the tracking token would make URLs too long and leaky.

### 1.3 Migration

```bash
npx prisma migrate dev --name add_tracking_proxy_support
```

---

## Task 2: Link Rewriting Service

**New File:** `apps/web/src/server/service/tracking-service.ts`

This is the core service that transforms outgoing email HTML.

### 2.1 Link Rewriter

When `clickTracking` is enabled on a domain, rewrite all `<a href="...">` links in the HTML body to point through the tracking proxy:

```typescript
/**
 * Rewrites links in HTML email body for click tracking.
 *
 * Before: <a href="https://example.com/pricing">
 * After:  <a href="https://track.customer.com/t/c/{trackedLinkId}">
 *
 * Skips:
 * - mailto: links
 * - tel: links
 * - Unsubscribe URLs (already tracked separately)
 * - Anchor (#) links
 */
export async function rewriteLinksForTracking(
  html: string,
  emailId: string,
  trackingBaseUrl: string, // e.g., "https://track.customer.com" or "https://app.usesend.com"
): Promise<string>
```

Implementation approach:
- Use a simple regex or HTML parser to find `<a href="...">` tags
- For each trackable link, create a `TrackedLink` record in the DB
- Replace the href with `{trackingBaseUrl}/t/c/{trackedLink.id}`
- Batch-insert TrackedLink records for performance

### 2.2 Open Pixel Injector

When `openTracking` is enabled, inject a tracking pixel before `</body>`:

```typescript
/**
 * Injects a 1x1 transparent tracking pixel into HTML email body.
 *
 * Adds: <img src="https://track.customer.com/t/o/{emailId}" width="1" height="1"
 *        style="display:none" alt="" />
 */
export function injectOpenTrackingPixel(
  html: string,
  emailId: string,
  trackingBaseUrl: string,
): string
```

### 2.3 Main Transform Function

Single entry point called during email sending:

```typescript
/**
 * Applies all tracking transformations to email HTML.
 * Called from the email queue worker before sending via SES.
 *
 * @param html - Raw email HTML
 * @param emailId - Email record ID
 * @param domain - Domain with tracking settings
 * @returns Transformed HTML with tracking links/pixel
 */
export async function applyTracking(
  html: string,
  emailId: string,
  domain: Domain,
): Promise<string>
```

Logic:
1. Determine `trackingBaseUrl`:
   - If `domain.trackingDomain` is set and verified → `https://{domain.trackingDomain}`
   - Else → `{NEXTAUTH_URL}` (the app's own URL as fallback)
2. If `domain.clickTracking` → run `rewriteLinksForTracking()`
3. If `domain.openTracking` → run `injectOpenTrackingPixel()`
4. Return transformed HTML

---

## Task 3: Tracking Proxy Endpoints

**New Files:**
- `apps/web/src/app/t/c/[id]/route.ts` — Click redirect endpoint
- `apps/web/src/app/t/o/[id]/route.ts` — Open pixel endpoint

### 3.1 Click Tracking Endpoint (`GET /t/c/{trackedLinkId}`)

```typescript
// apps/web/src/app/t/c/[id]/route.ts

/**
 * Click tracking redirect endpoint.
 *
 * Flow:
 * 1. Look up TrackedLink by ID
 * 2. Record click event (EmailEvent with status CLICKED)
 * 3. Update email latestStatus
 * 4. Update daily metrics
 * 5. Emit webhook
 * 6. HTTP 302 redirect to original URL
 *
 * Performance considerations:
 * - DB lookup must be fast (TrackedLink.id is primary key)
 * - Event recording should be async (queue in BullMQ) to not block redirect
 * - Cache TrackedLink lookups in Redis for repeat clicks
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response>
```

**Error handling:**
- Unknown ID → redirect to a safe fallback page or return 404
- DB errors → still try to redirect (don't break the user's experience)

**Security:**
- Rate limit per IP to prevent abuse
- No open redirect — only redirect to URLs stored in TrackedLink table

### 3.2 Open Tracking Endpoint (`GET /t/o/{emailId}`)

```typescript
// apps/web/src/app/t/o/[id]/route.ts

/**
 * Open tracking pixel endpoint.
 *
 * Flow:
 * 1. Record open event (EmailEvent with status OPENED)
 * 2. Update email latestStatus
 * 3. Update daily metrics
 * 4. Emit webhook
 * 5. Return 1x1 transparent GIF with cache headers
 *
 * The emailId is used directly (no separate table needed).
 * Multiple opens from same email are recorded as separate events.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response>
```

**Response:**
- Content-Type: `image/gif`
- Body: 1x1 transparent GIF (43 bytes)
- Cache-Control: `no-store, no-cache` (to detect repeat opens)

### 3.3 Event Recording (Shared Logic)

Both endpoints need to record events. Factor this into a shared function:

```typescript
/**
 * Records a tracking event from the proxy endpoint.
 * Mirrors what ses-hook-parser does for SES-originated events,
 * but triggered by our own proxy.
 */
async function recordTrackingEvent(params: {
  emailId: string;
  status: "OPENED" | "CLICKED";
  ip?: string;
  userAgent?: string;
  url?: string; // For clicks
}): Promise<void>
```

This should:
1. Create an `EmailEvent` record
2. Update `Email.latestStatus` (same logic as `ses-hook-parser.ts`)
3. Update `DailyEmailUsage` metrics
4. Update `Campaign` counters if applicable
5. Emit webhook via `WebhookService`

**Important:** Use the same BullMQ queue pattern as `ses-hook-parser.ts` so event recording doesn't block the HTTP response.

---

## Task 4: Modify Email Sending Pipeline

**File:** `apps/web/src/server/service/email-queue-service.ts`

### 4.1 Apply Tracking Before Sending

In the email queue worker, apply tracking transformations to the HTML **before** passing it to `ses.sendRawEmail()`:

```typescript
// In the worker function, after fetching the email and domain:

let html = email.html;

if (html && domain) {
  html = await applyTracking(html, email.id, domain);
}

// Then pass transformed html to sendRawEmail
```

### 4.2 Change Configuration Set Selection

When using self-hosted tracking, we should **disable SES click/open tracking** and only use the `configGeneral` config set. SES tracking would conflict with our rewritten links.

**File:** `apps/web/src/utils/ses-utils.ts`

```typescript
export async function getConfigurationSetName(
  clickTracking: boolean,
  openTracking: boolean,
  region: string,
  useSelfHostedTracking: boolean, // NEW PARAMETER
) {
  const setting = await SesSettingsService.getSetting(region);

  if (!setting) {
    throw new Error(`No SES setting found for region: ${region}`);
  }

  // When self-hosted tracking is active, always use general config
  // (no SES click/open tracking — we handle it ourselves)
  if (useSelfHostedTracking) {
    return setting.configGeneral;
  }

  // Legacy behavior for self-hosted instances not using the proxy
  if (clickTracking && openTracking) {
    return setting.configFull;
  }
  if (clickTracking) {
    return setting.configClick;
  }
  if (openTracking) {
    return setting.configOpen;
  }

  return setting.configGeneral;
}
```

**Decision:** Self-hosted tracking should be the default for cloud (`NEXT_PUBLIC_IS_CLOUD=true`). Self-hosted UseSend instances can choose either approach.

---

## Task 5: Custom Tracking Domain Setup (DNS + Verification)

**File:** `apps/web/src/server/service/domain-service.ts`

### 5.1 Set Tracking Domain

```typescript
/**
 * Sets a custom tracking domain for a domain.
 * The user must create a CNAME record pointing to the UseSend app.
 *
 * DNS setup required:
 *   track.example.com CNAME → track.usesend.com (cloud)
 *   track.example.com CNAME → your-usesend-instance.com (self-hosted)
 */
export async function setTrackingDomain(
  domainId: number,
  teamId: number,
  trackingDomain: string,
): Promise<{ dnsRecord: DomainDnsRecord }>
```

Validates:
- Tracking domain is a subdomain of the sending domain
- Domain belongs to the team
- Domain is verified

Returns the CNAME record the user must create.

### 5.2 Verify Tracking Domain

```typescript
/**
 * Verifies tracking domain CNAME is properly configured.
 * Uses DNS lookup to confirm the CNAME points to the expected target.
 */
export async function verifyTrackingDomain(
  domainId: number,
  teamId: number,
): Promise<{ success: boolean; error?: string }>
```

**CNAME targets:**
- Cloud: `track.usesend.com` (or whatever the cloud tracking hostname is)
- Self-hosted: Value of `NEXTAUTH_URL` hostname

### 5.3 Remove Tracking Domain

```typescript
export async function removeTrackingDomain(
  domainId: number,
  teamId: number,
): Promise<{ success: boolean }>
```

### 5.4 Update `buildDnsRecords` to Include Tracking CNAME

When a tracking domain is configured, show the required CNAME in the DNS records table:

```typescript
function buildDnsRecords(domain: Domain): DomainDnsRecord[] {
  const records = [
    // ... existing MX, TXT, DMARC records ...
  ];

  if (domain.trackingDomain) {
    records.push({
      type: "CNAME",
      name: domain.trackingDomain,
      value: getTrackingCnameTarget(), // "track.usesend.com" for cloud
      ttl: "Auto",
      status: domain.trackingDomainStatus,
    });
  }

  return records;
}
```

---

## Task 6: SSL/TLS for Custom Tracking Domains

Custom tracking domains need HTTPS (email clients won't load HTTP pixels, and browsers warn on HTTP redirects).

### 6.1 Cloud Deployment

Use **CloudFront + ACM** (AWS Certificate Manager) or a reverse proxy like **Caddy** that auto-provisions Let's Encrypt certificates:

**Option A: CloudFront (recommended for cloud)**
- CloudFront distribution with wildcard or per-domain SSL
- Origin: UseSend app server
- Path pattern: `/t/*` → forward to tracking endpoint
- Users CNAME their tracking domain to the CloudFront distribution

**Option B: Caddy reverse proxy**
- Caddy auto-provisions Let's Encrypt certs on demand
- Add each verified tracking domain to Caddy's config
- Caddy handles TLS termination, forwards to Next.js

### 6.2 Self-Hosted Deployment

- Users handle their own SSL (they already do for the main app)
- Their tracking domain CNAME points to their own UseSend instance
- Their existing reverse proxy (nginx/Caddy/Traefik) handles SSL

### 6.3 New Environment Variable

```
TRACKING_DOMAIN_CNAME_TARGET=track.usesend.com  # What users point their CNAME at
```

Add to `env.js`:
```typescript
TRACKING_DOMAIN_CNAME_TARGET: z.string().optional(),
```

---

## Task 7: Update Types and Schemas

### 7.1 Update DomainDnsRecord Type

**File:** `apps/web/src/types/domain.ts`

```typescript
export type DomainDnsRecord = {
  type: "MX" | "TXT" | "CNAME";  // Add CNAME
  name: string;
  value: string;
  ttl: string;
  priority?: string | null;
  status: DomainStatus;
  recommended?: boolean;
};
```

### 7.2 Update Zod Schemas

**File:** `apps/web/src/lib/zod/domain-schema.ts`

Add `trackingDomain`, `trackingDomainStatus`, `trackingDomainError`, `trackingDomainVerifiedAt` to the domain schema. Add `"CNAME"` to the DNS record type enum.

---

## Task 8: API Endpoints

### 8.1 tRPC Endpoints

**File:** `apps/web/src/server/api/routers/domain.ts`

Add three new mutations:

| Endpoint | Input | Action |
|----------|-------|--------|
| `setTrackingDomain` | `{ id, trackingDomain }` | Save tracking domain, return DNS record |
| `verifyTrackingDomain` | `{ id }` | Verify CNAME, update status |
| `removeTrackingDomain` | `{ id }` | Remove tracking domain, reset status |

### 8.2 Public REST API Endpoints

**New Files:**
- `apps/web/src/server/public-api/api/domains/set-tracking-domain.ts`
- `apps/web/src/server/public-api/api/domains/verify-tracking-domain.ts`
- `apps/web/src/server/public-api/api/domains/delete-tracking-domain.ts`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/domains/{id}/tracking-domain` | Set custom tracking domain |
| `POST` | `/v1/domains/{id}/tracking-domain/verify` | Verify DNS |
| `DELETE` | `/v1/domains/{id}/tracking-domain` | Remove tracking domain |

---

## Task 9: Frontend UI Changes

**File:** `apps/web/src/app/(dashboard)/domains/[domainId]/page.tsx`

Add a "Custom Tracking Domain" section to the domain settings page:

### States

1. **No tracking domain configured:**
   - Input field with placeholder `track.{domain.name}`
   - "Set Domain" button

2. **Tracking domain PENDING:**
   - Show the required CNAME record in the DNS table
   - "Verify DNS" button
   - Status badge showing PENDING

3. **Tracking domain VERIFIED:**
   - Show tracking domain with SUCCESS badge
   - "Remove" button

4. **Tracking domain FAILED:**
   - Show error message
   - "Retry Verification" button
   - "Remove" button

### Description Text

> Use a custom domain for click and open tracking links to improve
> deliverability and isolate your sender reputation. When configured,
> all tracking links in your emails will use this domain instead of
> the default shared tracking URLs.

---

## Task 10: Update SES Hook Parser for Coexistence

**File:** `apps/web/src/server/service/ses-hook-parser.ts`

When self-hosted tracking is active, SES will no longer send CLICK and OPEN events (since we use `configGeneral` which doesn't subscribe to those). However, we should still gracefully handle any CLICK/OPEN events that come through from SES in case of edge cases or mixed configurations.

No changes needed — the parser already handles all event types. Just ensure there's no conflict between SES-originated and proxy-originated events for the same email.

**Deduplication:** Add a `source` field to EmailEvent or use the event `data` JSON to distinguish SES-originated vs proxy-originated events. This is optional but helpful for debugging.

---

## Task 11: Webhook Events Update

**File:** `packages/lib/src/webhook/webhook-events.ts`

Update `DomainPayload` to include tracking domain fields:

```typescript
export interface DomainPayload {
  // ... existing fields ...
  trackingDomain?: string | null;
  trackingDomainStatus?: string | null;
}
```

---

## Task 12: SMTP Server Consideration

**File:** `apps/smtp-server/src/server.ts`

The SMTP server forwards raw emails to the `/api/v1/emails` endpoint. Since tracking transformations happen in the email queue worker (not at API ingestion time), SMTP-sent emails will automatically get tracking applied. **No changes needed to the SMTP server.**

---

## Implementation Order

| Step | Task | Dependencies |
|------|------|-------------|
| 1 | Database schema changes (Task 1) | None |
| 2 | Types and schemas (Task 7) | Task 1 |
| 3 | Tracking service — link rewriter + pixel injector (Task 2) | Task 1 |
| 4 | Tracking proxy endpoints (Task 3) | Task 1, 2 |
| 5 | Modify email sending pipeline (Task 4) | Task 2, 3 |
| 6 | Domain service — set/verify/remove tracking domain (Task 5) | Task 1 |
| 7 | Environment + SSL setup (Task 6) | Task 5 |
| 8 | tRPC + Public API endpoints (Task 8) | Task 5 |
| 9 | Frontend UI (Task 9) | Task 8 |
| 10 | Hook parser updates (Task 10) | Task 4 |
| 11 | Webhook events (Task 11) | Task 5 |
| 12 | Testing | All |

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/web/src/server/service/tracking-service.ts` | Link rewriting + open pixel injection |
| `apps/web/src/app/t/c/[id]/route.ts` | Click tracking redirect endpoint |
| `apps/web/src/app/t/o/[id]/route.ts` | Open tracking pixel endpoint |
| `apps/web/src/server/public-api/api/domains/set-tracking-domain.ts` | Public API |
| `apps/web/src/server/public-api/api/domains/verify-tracking-domain.ts` | Public API |
| `apps/web/src/server/public-api/api/domains/delete-tracking-domain.ts` | Public API |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/prisma/schema.prisma` | Add tracking fields + TrackedLink model |
| `apps/web/src/server/service/email-queue-service.ts` | Apply tracking transforms before SES send |
| `apps/web/src/utils/ses-utils.ts` | Use `configGeneral` when self-hosted tracking is active |
| `apps/web/src/server/service/domain-service.ts` | Add tracking domain CRUD + DNS verification |
| `apps/web/src/server/api/routers/domain.ts` | Add tRPC endpoints |
| `apps/web/src/types/domain.ts` | Add CNAME to DNS record type |
| `apps/web/src/lib/zod/domain-schema.ts` | Add tracking domain fields |
| `apps/web/src/app/(dashboard)/domains/[domainId]/page.tsx` | UI for tracking domain management |
| `apps/web/src/env.js` | Add `TRACKING_DOMAIN_CNAME_TARGET` |
| `packages/lib/src/webhook/webhook-events.ts` | Add tracking domain to webhook payload |

---

## Security Considerations

1. **No open redirect:** Click tracking endpoint only redirects to URLs stored in TrackedLink table, never to arbitrary user-supplied URLs in the request.

2. **Tracking domain validation:** Must be a subdomain of the verified sending domain to prevent domain hijacking.

3. **Rate limiting:** Tracking endpoints should be rate-limited per IP to prevent abuse/scraping.

4. **TrackedLink ID opacity:** Use cuid/nanoid (not sequential IDs) so link IDs can't be enumerated.

5. **No PII in tracking URLs:** Link IDs are opaque — the original URL is only stored server-side.

---

## Performance Considerations

1. **Link rewriting adds latency to email queue processing.** Mitigate with batch DB inserts for TrackedLink records.

2. **Tracking endpoints must be fast** — they're in the critical path of user clicks.
   - Redis cache for TrackedLink lookups
   - Async event recording via BullMQ (don't block the redirect)

3. **Open pixel requests are high volume** (email clients may prefetch).
   - Return static GIF immediately, record event async
   - Consider caching the GIF response at CDN level

4. **Database growth:** TrackedLink table will grow fast. Add TTL-based cleanup (same pattern as `EMAIL_CLEANUP_DAYS` env var for Email records).

---

## Migration Strategy

### For Existing Domains

- All new fields are optional with defaults — zero-downtime migration
- Existing domains continue using SES tracking until explicitly configured
- No breaking API changes

### Cloud vs Self-Hosted

| Behavior | Cloud (`IS_CLOUD=true`) | Self-Hosted |
|----------|------------------------|-------------|
| Default tracking | Self-hosted proxy | SES config sets (existing behavior) |
| Custom tracking domain | Supported | Supported |
| SSL for custom domains | CloudFront/Caddy | User's own reverse proxy |
| CNAME target | `track.usesend.com` | User's app hostname |

### Rollout

1. Deploy backend (tracking service + endpoints) with feature hidden
2. Enable for internal testing
3. Enable for beta users
4. GA rollout with documentation

---

## Testing Checklist

### Unit Tests
- [ ] Link rewriter correctly transforms all `<a href>` tags
- [ ] Link rewriter skips mailto:, tel:, anchor links
- [ ] Link rewriter skips unsubscribe URLs
- [ ] Open pixel injected before `</body>`
- [ ] Open pixel handles emails without `</body>` tag
- [ ] Tracking domain validation (must be subdomain of sending domain)
- [ ] DNS CNAME verification

### Integration Tests
- [ ] Full click tracking flow: send email → click link → redirect + event recorded
- [ ] Full open tracking flow: send email → load pixel → event recorded
- [ ] Event shows up in EmailEvent table and daily metrics
- [ ] Webhook fired on click/open
- [ ] Campaign counters updated on click/open
- [ ] Custom tracking domain: DNS verify → tracking URLs use custom domain
- [ ] Fallback: no custom domain → tracking URLs use app URL
- [ ] SMTP-sent emails get tracking applied

### Manual Testing
- [ ] Verify email renders correctly in Gmail, Outlook, Apple Mail
- [ ] Verify tracking pixel doesn't break email layout
- [ ] Verify redirects work with special characters in URLs
- [ ] Verify redirects work with query parameters and fragments
- [ ] Test with `clickTracking: true, openTracking: false` and vice versa
- [ ] Test with both disabled (no transformation)
