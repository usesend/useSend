# Email Forwarding - Scoping & Open Questions

**Issue:** [#113 - Feat: Add email forwarding](https://github.com/usesend/useSend/issues/113)
**Date:** 2026-02-25
**Status:** Needs scoping decisions

---

## Context

A feature request to add inbound email forwarding to Unsend. When a user's domain receives an email (e.g. `hey@harshbhat.me`), Unsend should process it and either forward it to another address or deliver it as JSON to a webhook URL.

The issue references [Postmark's inbound workflow](https://postmarkapp.com/developer/user-guide/inbound/sample-inbound-workflow) as prior art.

### What Exists Today

- **Outbound only** -- Unsend currently sends emails via AWS SES. There is no inbound email infrastructure.
- **Domain management** -- Users add domains, configure DNS (DKIM, SPF, DMARC, MX), and verify them. MX records currently point to SES feedback endpoints for bounce handling.
- **Webhook system** -- A full webhook dispatch system exists (BullMQ-based, with retries, HMAC signatures, auto-disable after failures). It currently handles outbound email events (delivered, bounced, opened, etc.).
- **SES callback** -- An SNS callback endpoint (`/api/ses_callback`) processes outbound delivery events. This pattern can be reused for inbound.
- **SMTP server** -- The existing `apps/smtp-server` is an outbound SMTP-to-HTTP proxy. It is not designed for receiving inbound email.
- **Queue infrastructure** -- BullMQ with Redis, multiple queues with workers following a `createWorkerHandler()` pattern.

---

## Open Questions

These decisions need to be made before implementation begins. They are ordered by impact -- earlier decisions affect later ones.

### 1. MVP Delivery Method

The issue mentions two use cases: forwarding to another email address, and delivering as JSON to a webhook. These are different features with different complexity.

| Option | Description | Complexity |
|--------|-------------|------------|
| **A. Email forwarding only** | Forward inbound email to a configured destination email address | Medium |
| **B. Webhook delivery only** | Parse inbound email and POST as JSON to a user-configured webhook URL | Medium |
| **C. Both** | Support both email forwarding and webhook delivery from the start | High |

**Considerations:**
- Option A is the simpler user experience but doesn't match what the issue explicitly requests (JSON on webhook URL)
- Option B matches the issue description more closely and leverages the existing webhook infrastructure
- Option C provides the most flexibility but increases scope significantly
- The two can be built independently; starting with one doesn't prevent adding the other later

**Decision needed:** Which delivery method(s) for MVP?

---

### 2. Forwarding Rule Granularity

How should users configure which emails get forwarded?

| Option | Description | Complexity |
|--------|-------------|------------|
| **A. Domain-level catch-all** | All emails to `*@domain.com` go to a single destination | Low |
| **B. Per-address rules** | Specific rules like `support@domain.com` -> `team@company.com` | Medium |
| **C. Both** | Per-address rules with a catch-all fallback for unmatched addresses | Medium-High |

**Considerations:**
- Catch-all is simpler but less useful for teams with multiple addresses
- Per-address gives precise control but requires more UI/management
- A hybrid (option C) is the most flexible but adds complexity to rule matching logic
- Most competing products (Postmark, Mailgun) support per-address with optional catch-all

**Decision needed:** What level of granularity for forwarding rules?

---

### 3. Inbound Email Receiving Infrastructure

How does SES receive inbound email? This is the core technical decision.

| Option | Description | Complexity |
|--------|-------------|------------|
| **A. SES Receipt Rules + SNS + S3** | SES stores raw email in S3 and notifies via SNS. Worker fetches from S3 to process. | Medium |
| **B. SES Receipt Rules + SNS only** | SES sends email content directly in SNS notification (150KB limit). No S3. | Low |
| **C. SES Receipt Rules + SNS (hybrid)** | S3 stores as fallback, SNS delivers inline. Worker uses SNS payload when possible, falls back to S3 for large emails. | Medium |
| **D. Custom SMTP inbound server** | Build a standalone SMTP server to receive inbound email. Full control, no SES dependency. | High |

**Considerations:**
- Options A-C all use SES email receiving, which is only available in 3 AWS regions: `us-east-1`, `us-west-2`, `eu-west-1`
- Option B has a hard 150KB limit on SNS messages -- emails with attachments over ~100KB will be truncated or lost
- Option C gives the simplicity of B for common cases with A's reliability for edge cases
- Option D avoids SES region limitations but requires building and scaling an always-on SMTP server with TLS, spam handling, and IP reputation management
- The existing codebase already uses the SES -> SNS -> callback -> BullMQ pattern for outbound events

**Decision needed:** Which infrastructure approach?

---

### 4. Deployment Scope

Should this work for self-hosted deployments from the start?

| Option | Description | Complexity |
|--------|-------------|------------|
| **A. Cloud only** | Only available on the hosted SaaS product initially | Lower |
| **B. Both cloud and self-hosted** | Self-hosted users configure their own SES receiving, S3, SNS | Higher |

**Considerations:**
- Cloud-only is faster to ship and easier to test
- Self-hosted requires documentation for AWS resource setup and additional environment variables
- The existing codebase already supports both modes for outbound sending
- Self-hosted users would need to create their own S3 bucket, SNS topic, and SES Receipt Rule Set

**Decision needed:** Cloud-only MVP or both from the start?

---

### 5. Email Header Rewriting Strategy

When forwarding, the original `From` address can't be preserved as-is because the forwarding domain doesn't have DKIM authority over the sender's domain. How should headers be rewritten?

| Option | Description |
|--------|-------------|
| **A. Rewrite From, preserve via Reply-To** | `From: "Alice via Unsend" <fwd@example.com>`, `Reply-To: alice@original.com` |
| **B. SRS (Sender Rewriting Scheme)** | Rewrite the envelope sender using SRS to pass SPF. More complex but more transparent. |
| **C. Preserve original From** | Keep original From header. Simpler but will likely fail SPF/DKIM checks and get spam-flagged. |

**Considerations:**
- Option A is the most common approach (used by Gmail, Mailgun, etc.)
- Option B is more technically correct but adds complexity
- Option C will cause deliverability problems and is not recommended
- This only applies if email forwarding (not webhook) is chosen

**Decision needed:** Header rewriting approach (if email forwarding is in scope)?

---

### 6. Inbound Email Storage & Visibility

Should users be able to see inbound emails in the dashboard, and how much data should be stored?

| Option | Description |
|--------|-------------|
| **A. Metadata only** | Store from, to, subject, status, timestamp. No email body. | 
| **B. Full storage** | Store parsed email content (body, attachments) for viewing in the UI |
| **C. Log with TTL** | Store metadata with automatic cleanup after N days |

**Considerations:**
- Metadata-only is simpler and avoids storage cost concerns
- Full storage enables a richer UI but raises storage, privacy, and retention questions
- A log with TTL is a good middle ground for debugging without unbounded growth
- The outbound email model stores subject, text, and HTML -- a similar pattern could be used

**Decision needed:** How much inbound email data to store and display?

---

## PRD (Pending Decisions)

The sections below outline the feature design with placeholders where open questions need to be resolved. Sections marked with `[PENDING: #N]` reference the open question above.

### Data Model

#### EmailForwardingRule

```prisma
model EmailForwardingRule {
  id                 String   @id @default(cuid())
  teamId             Int
  domainId           Int
  sourceAddress      String   // [PENDING: #2] local part only, or "*" for catch-all
  destinationAddress String   // [PENDING: #1] email address, webhook URL, or both?
  enabled            Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  team   Team   @relation(fields: [teamId], references: [id])
  domain Domain @relation(fields: [domainId], references: [id], onDelete: Cascade)

  @@unique([domainId, sourceAddress])
}
```

#### InboundEmail

```prisma
model InboundEmail {
  id               String             @id @default(cuid())
  teamId           Int
  domainId         Int
  forwardingRuleId String?
  from             String
  to               String
  subject          String?
  // [PENDING: #6] text/html fields if full storage is chosen
  receivedAt       DateTime           @default(now())
  status           InboundEmailStatus @default(RECEIVED)
  s3Key            String?            // [PENDING: #3] only if S3 is used
  errorMessage     String?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  team           Team                 @relation(fields: [teamId], references: [id])
  domain         Domain               @relation(fields: [domainId], references: [id])
  forwardingRule EmailForwardingRule?  @relation(fields: [forwardingRuleId], references: [id])
}

enum InboundEmailStatus {
  RECEIVED
  FORWARDING
  FORWARDED
  FAILED
  NO_RULE
}
```

#### Domain Model Additions

```prisma
// Added to existing Domain model:
inboundEnabled     Boolean  @default(false)
sesReceiptRuleId   String?  // [PENDING: #3] only if SES Receipt Rules are used
```

### API Surface

#### TRPC Router: `forwarding`

| Procedure | Type | Description |
|-----------|------|-------------|
| `listRules` | query | List forwarding rules for a domain |
| `createRule` | mutation | Create a forwarding rule |
| `updateRule` | mutation | Update destination or toggle enabled |
| `deleteRule` | mutation | Delete a rule |
| `enableInbound` | mutation | Enable inbound on a domain; provision infrastructure |
| `disableInbound` | mutation | Disable inbound; tear down infrastructure |
| `listInboundEmails` | query | Paginated log of inbound emails |

#### REST API (Public)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/domains/:id/forwarding-rules` | List rules |
| `POST` | `/v1/domains/:id/forwarding-rules` | Create rule |
| `DELETE` | `/v1/domains/:id/forwarding-rules/:ruleId` | Delete rule |
| `PUT` | `/v1/domains/:id/inbound` | Enable/disable inbound |

#### Callback

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/inbound_callback` | [PENDING: #3] SNS notification endpoint |

### Infrastructure

[PENDING: #3 and #4] -- Infrastructure requirements depend on the receiving approach and deployment scope.

**If SES-based (Options A/B/C):**

| Resource | Purpose |
|----------|---------|
| S3 Bucket | Store raw inbound emails (if S3 is used) |
| SNS Topic | Receive SES notifications |
| SES Receipt Rule Set | Container for per-domain rules |

**New BullMQ queue:** `inbound-email` with worker following existing patterns.

**New environment variables:**

| Variable | Required For |
|----------|-------------|
| `INBOUND_S3_BUCKET` | S3-based approaches |
| `INBOUND_SNS_TOPIC_ARN` | All SES-based approaches |
| `INBOUND_SES_RULE_SET` | All SES-based approaches |

### UI

The domain detail page (`/domains/[domainId]`) is restructured with tabs:

- **Overview** -- existing DNS records and Settings (unchanged)
- **Forwarding** -- new tab with:
  1. Inbound toggle card with MX record display when enabled
  2. Forwarding rules table with add/edit/delete/toggle
  3. Add rule dialog
  4. Inbound email log (collapsible)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| No matching rule | InboundEmail status `NO_RULE`; email dropped |
| Rule disabled | Same as no rule |
| Send/forward failure | Status `FAILED` with error; retry via queue |
| S3 fetch failure | Retry with backoff; fail after max attempts |
| Domain inbound disabled | Receipt Rule removed; SES stops receiving |

---

## Recommended Decisions

Based on the codebase analysis and typical usage patterns, here are recommendations for each open question:

| # | Question | Recommendation | Reasoning |
|---|----------|---------------|-----------|
| 1 | MVP delivery method | **Email forwarding only** | Simpler to validate; webhook can be added as a follow-up using the existing webhook infrastructure |
| 2 | Rule granularity | **Per-address rules** | More useful than catch-all; catch-all can be added later as a special `*` source address |
| 3 | Infrastructure | **SES + SNS hybrid with S3 fallback** | Reuses existing SES/SNS/BullMQ patterns; handles large emails without making S3 the primary path |
| 4 | Deployment scope | **Both cloud and self-hosted** | Existing outbound infrastructure already supports both; marginal additional effort |
| 5 | Header rewriting | **Rewrite From, preserve via Reply-To** | Industry standard approach; simplest to implement correctly |
| 6 | Inbound storage | **Metadata only** | Keeps scope small; full content storage can be added later |
