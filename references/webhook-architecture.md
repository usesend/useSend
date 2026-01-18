# Webhook Architecture

This document explains the webhook system architecture, including how events are emitted, queued, delivered, and displayed.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    EVENT SOURCES                                     │
├─────────────────────┬─────────────────────┬─────────────────────────────────────────┤
│   Email Service     │   Contact Service   │           Domain Service                │
│  (SES callbacks)    │   (CRUD operations) │         (verification, etc.)            │
└─────────┬───────────┴──────────┬──────────┴──────────────────┬──────────────────────┘
          │                      │                             │
          │                      ▼                             │
          │         ┌───────────────────────┐                  │
          └────────►│  WebhookService.emit  │◄─────────────────┘
                    │    (teamId, type,     │
                    │       payload)        │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Find Active Webhooks │
                    │   matching event type  │
                    └───────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
     │  Webhook A  │   │  Webhook B  │   │  Webhook C  │
     └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
            │                 │                 │
            ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL Database                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  WebhookCall (one per matching webhook)                                      │    │
│  │  ├── status: PENDING                                                         │    │
│  │  ├── payload: { event data only }                                            │    │
│  │  └── attempt: 0                                                              │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               Redis + BullMQ                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  WEBHOOK_DISPATCH_QUEUE                                                      │    │
│  │  ├── Job: { callId: "call_abc", teamId: 123 }                                │    │
│  │  ├── Job: { callId: "call_def", teamId: 123 }                                │    │
│  │  └── Job: { callId: "call_ghi", teamId: 456 }                                │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                │
                                │  BullMQ Worker (concurrency: 25)
                                ▼
                    ┌───────────────────────┐
                    │  processWebhookCall   │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Acquire Redis Lock   │──────┐
                    │  (per webhook ID)     │      │ Lock failed
                    └───────────┬───────────┘      │
                                │ Lock acquired    ▼
                                │           ┌─────────────┐
                    ┌───────────▼──────┐    │ Retry later │
                    │ Check webhook    │    └─────────────┘
                    │ status = ACTIVE? │
                    └───────────┬──────┘
                           Yes  │  No
                    ┌───────────┘  └──────────────┐
                    ▼                             ▼
          ┌─────────────────┐           ┌─────────────────┐
          │  buildPayload   │           │ Mark call as    │
          │  (wrap event    │           │ DISCARDED       │
          │   data)         │           └─────────────────┘
          └────────┬────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              HTTP POST Request                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Headers:                                                                    │    │
│  │  ├── X-UseSend-Signature: v1=<hmac-sha256>                                   │    │
│  │  ├── X-UseSend-Timestamp: 1705312200000                                      │    │
│  │  ├── X-UseSend-Event: email.delivered                                        │    │
│  │  └── X-UseSend-Call: call_abc123                                             │    │
│  │                                                                              │    │
│  │  Body: {                                                                     │    │
│  │    "id": "call_abc123",                                                      │    │
│  │    "type": "email.delivered",                                                │    │
│  │    "version": "2026-01-18",                                                │    │
│  │    "createdAt": "...",                                                       │    │
│  │    "teamId": 123,                                                            │    │
│  │    "data": { ... event payload ... },                                        │    │
│  │    "attempt": 1                                                              │    │
│  │  }                                                                           │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            ┌─────────────┐         ┌─────────────┐
            │   2xx OK    │         │  Non-2xx /  │
            │             │         │   Timeout   │
            └──────┬──────┘         └──────┬──────┘
                   │                       │
                   ▼                       ▼
          ┌─────────────────┐     ┌─────────────────────┐
          │ Mark DELIVERED  │     │ Increment failures  │
          │ Reset failures  │     │ attempt < 6?        │
          │ to 0            │     └──────────┬──────────┘
          └─────────────────┘           Yes  │  No
                                  ┌──────────┘  └──────────┐
                                  ▼                        ▼
                         ┌─────────────────┐      ┌─────────────────┐
                         │ Mark PENDING    │      │ Mark FAILED     │
                         │ Schedule retry  │      │                 │
                         │ (exp. backoff)  │      │ failures >= 30? │
                         └─────────────────┘      └────────┬────────┘
                                                      Yes  │  No
                                               ┌───────────┘  └────┐
                                               ▼                   ▼
                                      ┌─────────────────┐    ┌──────────┐
                                      │ AUTO_DISABLE    │    │   Done   │
                                      │ webhook         │    └──────────┘
                                      └─────────────────┘
```

## Call Status State Machine

```
                              ┌──────────────────────────────────────┐
                              │                                      │
                              ▼                                      │
┌─────────┐  enqueue   ┌───────────┐  worker picks up  ┌─────────────────┐
│ (start) │ ──────────►│  PENDING  │ ─────────────────►│  IN_PROGRESS    │
└─────────┘            └───────────┘                   └────────┬────────┘
                              ▲                                 │
                              │                    ┌────────────┼────────────┐
                              │                    │            │            │
                              │ retry (attempt<6)  │            │            │
                              │                    ▼            ▼            ▼
                              │            ┌───────────┐ ┌───────────┐ ┌───────────┐
                              └────────────│  (fail)   │ │  SUCCESS  │ │  WEBHOOK  │
                                           └─────┬─────┘ └─────┬─────┘ │ INACTIVE  │
                                                 │             │       └─────┬─────┘
                                                 │             │             │
                                          attempt >= 6         │             │
                                                 │             ▼             ▼
                                                 │      ┌───────────┐ ┌───────────┐
                                                 └─────►│  FAILED   │ │ DISCARDED │
                                                        └───────────┘ └───────────┘
```

## Overview

The webhook system allows users to receive real-time HTTP notifications when events occur (emails sent, contacts created, domains verified, etc.). The system is built with reliability in mind, featuring:

- Asynchronous delivery via BullMQ
- Exponential backoff with jitter for retries
- Automatic webhook disabling after consecutive failures
- Per-webhook locking to ensure ordered delivery
- HMAC signature verification for security

## Core Components

### 1. Database Models

Located in `apps/web/prisma/schema.prisma`:

```
Webhook
├── id (cuid)
├── teamId (FK → Team)
├── url (endpoint URL)
├── secret (signing key, prefixed with "whsec_")
├── status (ACTIVE | PAUSED | AUTO_DISABLED)
├── eventTypes (string[] - empty means all events)
├── apiVersion (optional version string)
├── consecutiveFailures (counter for auto-disable)
├── lastFailureAt / lastSuccessAt (timestamps)
└── createdByUserId (FK → User)

WebhookCall
├── id (cuid)
├── webhookId (FK → Webhook)
├── teamId (FK → Team)
├── type (event type, e.g., "email.delivered")
├── payload (JSON string - event data only)
├── status (PENDING | IN_PROGRESS | DELIVERED | FAILED | DISCARDED)
├── attempt (current attempt number)
├── nextAttemptAt (scheduled retry time)
├── lastError (error message if failed)
├── responseStatus / responseTimeMs / responseText
└── createdAt / updatedAt
```

### 2. Service Layer

Located in `apps/web/src/server/service/webhook-service.ts`:

- **WebhookService**: CRUD operations for webhooks and webhook calls
- **WebhookQueueService**: BullMQ queue management for async delivery

### 3. Event Types

Defined in `packages/lib/src/webhook/webhook-events.ts`:

```typescript
// Contact events
"contact.created" | "contact.updated" | "contact.deleted";

// Domain events
"domain.created" | "domain.verified" | "domain.updated" | "domain.deleted";

// Email events
"email.queued" |
  "email.sent" |
  "email.delivery_delayed" |
  "email.delivered" |
  "email.bounced" |
  "email.rejected" |
  "email.rendering_failure" |
  "email.complained" |
  "email.failed" |
  "email.cancelled" |
  "email.suppressed" |
  "email.opened" |
  "email.clicked";

// Test events
("webhook.test");
```

## Webhook Flow

### Step 1: Event Emission

When an event occurs in the system, `WebhookService.emit()` is called:

```typescript
// Example: emitting an email.delivered event
await WebhookService.emit(teamId, "email.delivered", {
  id: email.id,
  status: "DELIVERED",
  from: email.from,
  to: email.to,
  occurredAt: new Date().toISOString(),
  // ... other fields
});
```

### Step 2: Webhook Matching & Call Creation

`emit()` performs the following:

1. Finds all ACTIVE webhooks for the team that subscribe to the event type
2. Creates a `WebhookCall` record for each matching webhook (stores event data as `payload`)
3. Enqueues the call ID to BullMQ for async processing

```typescript
// Webhook matching logic
const activeWebhooks = await db.webhook.findMany({
  where: {
    teamId,
    status: WebhookStatus.ACTIVE,
    OR: [
      { eventTypes: { has: type } }, // Subscribed to this event
      { eventTypes: { isEmpty: true } }, // Subscribed to ALL events
    ],
  },
});
```

### Step 3: Queue Processing

The BullMQ worker (`processWebhookCall`) handles delivery:

1. **Lock Acquisition**: Acquires a Redis lock per webhook to ensure ordered delivery
2. **Status Check**: Skips if webhook is no longer ACTIVE (marks call as DISCARDED)
3. **Payload Building**: Wraps the stored event data in the full payload structure
4. **HTTP POST**: Sends signed request to the webhook URL
5. **Result Handling**: Updates call status and webhook metrics

### Step 4: Payload Structure

**Important**: The stored `WebhookCall.payload` contains only the event data. The actual HTTP request body is built at delivery time by `buildPayload()`:

```typescript
// Stored in WebhookCall.payload (event data only):
{
  "id": "email_123",
  "status": "DELIVERED",
  "from": "sender@example.com",
  "to": ["recipient@example.com"],
  "occurredAt": "2024-01-15T10:30:00Z"
}

// Actual payload sent to webhook endpoint:
{
  "id": "call_abc123",           // WebhookCall ID
  "type": "email.delivered",     // Event type
  "version": "2026-01-18",       // API version
  "createdAt": "2024-01-15T10:30:00Z",
  "teamId": 123,
  "data": {                      // Original event data nested here
    "id": "email_123",
    "status": "DELIVERED",
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "occurredAt": "2024-01-15T10:30:00Z"
  },
  "attempt": 1
}
```

### Step 5: Request Signing

Each request includes security headers for verification:

```
Content-Type: application/json
User-Agent: UseSend-Webhook/1.0
X-UseSend-Event: email.delivered
X-UseSend-Call: call_abc123
X-UseSend-Timestamp: 1705312200000
X-UseSend-Signature: v1=<hmac-sha256-hex>
X-UseSend-Retry: false
```

Signature computation:

```typescript
const signature = HMAC - SHA256(secret, `${timestamp}.${JSON.stringify(body)}`);
// Format: "v1=" + hex(signature)
```

## Retry & Failure Handling

### Retry Configuration

```typescript
const WEBHOOK_MAX_ATTEMPTS = 6;
const WEBHOOK_BASE_BACKOFF_MS = 5_000; // 5 seconds
const WEBHOOK_AUTO_DISABLE_THRESHOLD = 30;
```

### Backoff Schedule (approximate)

| Attempt | Delay (base) | With Jitter |
| ------- | ------------ | ----------- |
| 1       | 5s           | 5-6.5s      |
| 2       | 10s          | 10-13s      |
| 3       | 20s          | 20-26s      |
| 4       | 40s          | 40-52s      |
| 5       | 80s          | 80-104s     |
| 6       | 160s         | 160-208s    |

### Auto-Disable

After 30 consecutive failures across any calls, the webhook is automatically set to `AUTO_DISABLED` status. This prevents continued delivery attempts to consistently failing endpoints.

### Call Status Flow

```
PENDING → IN_PROGRESS → DELIVERED (success)
                      → PENDING (retry on failure, attempts < 6)
                      → FAILED (max attempts reached)
                      → DISCARDED (webhook disabled/paused)
```

## SDK Webhook Verification

Located in `packages/sdk/src/webhooks.ts`:

```typescript
import { UseSend } from "usesend";

const usesend = new UseSend("us_api_key");
const webhooks = usesend.webhooks("whsec_your_secret");

// Option 1: Verify only (returns boolean)
const isValid = webhooks.verify(rawBody, { headers: request.headers });

// Option 2: Verify and parse (throws on invalid)
const event = webhooks.constructEvent(rawBody, { headers: request.headers });

if (event.type === "email.delivered") {
  console.log(event.data.to); // Type-safe access
}
```

## UI Payload Display

The webhook call details UI (`apps/web/src/app/(dashboard)/webhooks/[webhookId]/webhook-call-details.tsx`) reconstructs the full payload for display, matching what was actually sent to the endpoint. This uses the same structure as `buildPayload()` in the service layer.

## Important Files

| File                                             | Purpose                     |
| ------------------------------------------------ | --------------------------- |
| `apps/web/prisma/schema.prisma`                  | Database models             |
| `apps/web/src/server/service/webhook-service.ts` | Core service & queue worker |
| `apps/web/src/server/api/routers/webhook.ts`     | TRPC API routes             |
| `apps/web/src/lib/constants/plans.ts`            | Webhook limits per plan     |
| `packages/lib/src/webhook/webhook-events.ts`     | Event type definitions      |
| `packages/sdk/src/webhooks.ts`                   | SDK verification utilities  |
| `apps/web/src/app/(dashboard)/webhooks/`         | UI components               |

## Configuration Constants

```typescript
// apps/web/src/server/service/webhook-service.ts
const WEBHOOK_DISPATCH_CONCURRENCY = 25; // Parallel workers
const WEBHOOK_MAX_ATTEMPTS = 6; // Max delivery attempts
const WEBHOOK_BASE_BACKOFF_MS = 5_000; // Initial retry delay
const WEBHOOK_LOCK_TTL_MS = 15_000; // Redis lock TTL
const WEBHOOK_LOCK_RETRY_DELAY_MS = 2_000; // Lock retry delay
const WEBHOOK_AUTO_DISABLE_THRESHOLD = 30; // Failures before disable
const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000; // HTTP timeout
const WEBHOOK_RESPONSE_TEXT_LIMIT = 4_096; // Max response body stored
const WEBHOOK_EVENT_VERSION = "2026-01-18"; // Default API version
```

## Plan Limits

```typescript
// apps/web/src/lib/constants/plans.ts
FREE: {
  webhooks: 1;
}
BASIC: {
  webhooks: -1;
} // unlimited
```
