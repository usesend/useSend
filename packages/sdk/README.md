# useSend SDK

## Prerequisites

- [useSend API key](https://app.usesend.com/dev-settings/api-keys)
- [Verified domain](https://app.usesend.com/domains)

## Installation

### NPM

```bash
npm install usesend
```

### Yarn

```bash
yarn add usesend
```

### PNPM

```bash
pnpm add usesend
```

### Bun

```bash
bun add usesend
```

## Usage

```javascript
import { UseSend } from "usesend";

const usesend = new UseSend("us_12345");

// for self-hosted installations you can pass your base URL
// const usesend = new UseSend("us_12345", "https://app.usesend.com");

usesend.emails.send({
  to: "hello@acme.com",
  from: "hello@company.com",
  subject: "useSend email",
  html: "<p>useSend is the best open source product to send emails</p>",
  text: "useSend is the best open source product to send emails",
});

// Safely retry sends with an idempotency key
await usesend.emails.send(
  {
    to: "hello@acme.com",
    from: "hello@company.com",
    subject: "useSend email",
    html: "<p>useSend is the best open source product to send emails</p>",
  },
  { idempotencyKey: "signup-123" },
);

// Works for bulk sends too
await usesend.emails.batch(
  [
    {
      to: "a@example.com",
      from: "hello@company.com",
      subject: "Welcome",
      html: "<p>Hello A</p>",
    },
    {
      to: "b@example.com",
      from: "hello@company.com",
      subject: "Welcome",
      html: "<p>Hello B</p>",
    },
  ],
  { idempotencyKey: "bulk-welcome-1" },
);
// Reusing the same key with a different payload returns HTTP 409.
```

## Campaigns

Create and manage email campaigns:

```javascript
import { UseSend } from "usesend";

const usesend = new UseSend("us_12345");

// Create a campaign
const campaign = await usesend.campaigns.create({
  name: "Welcome Series",
  from: "hello@company.com",
  subject: "Welcome to our platform!",
  contactBookId: "cb_12345",
  html: "<h1>Welcome!</h1><p>Thanks for joining us.</p>",
  sendNow: false,
});

// Schedule a campaign
await usesend.campaigns.schedule(campaign.data.id, {
  scheduledAt: "2024-12-01T09:00:00Z",
  batchSize: 1000,
});

// Get campaign details
const details = await usesend.campaigns.get(campaign.data.id);

// Pause a campaign
await usesend.campaigns.pause(campaign.data.id);

// Resume a campaign
await usesend.campaigns.resume(campaign.data.id);
```

## Webhooks

Verify webhook signatures and get typed events:

```ts
import { UseSend } from "usesend";

const usesend = new UseSend("us_12345");
const webhooks = usesend.webhooks(process.env.USESEND_WEBHOOK_SECRET!);

// In a Next.js App Route
export async function POST(request: Request) {
  try {
    const rawBody = await request.text(); // important: raw body, not parsed JSON
    const event = webhooks.constructEvent(rawBody, {
      headers: request.headers,
    });

    if (event.type === "email.delivered") {
      // event.data is strongly typed here
    }

    return new Response("ok");
  } catch (error) {
    return new Response((error as Error).message, { status: 400 });
  }
}
```

You can also use the `Webhooks` class directly:

```ts
import { Webhooks } from "usesend";

const webhooks = new Webhooks(process.env.USESEND_WEBHOOK_SECRET!);
const event = webhooks.constructEvent(rawBody, { headers: request.headers });
```

Need only signature verification? Use the `verify` method:

```ts
const isValid = webhooks.verify(rawBody, { headers: request.headers });

if (!isValid) {
  return new Response("Invalid signature", { status: 401 });
}
```

Express example (ensure raw body is preserved):

```ts
import express from "express";
import { Webhooks } from "usesend";

const webhooks = new Webhooks(process.env.USESEND_WEBHOOK_SECRET!);

const app = express();
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const event = webhooks.constructEvent(req.body, {
      headers: req.headers,
    });

    if (event.type === "email.bounced") {
      // handle bounce
    }

    res.status(200).send("ok");
  } catch (error) {
    res.status(400).send((error as Error).message);
  }
});
```

Headers sent by UseSend:

- `X-UseSend-Signature`: `v1=` + HMAC-SHA256 of `${timestamp}.${rawBody}`
- `X-UseSend-Timestamp`: Unix epoch in milliseconds
- `X-UseSend-Event`: webhook event type
- `X-UseSend-Call`: unique webhook attempt id

By default, signatures are only accepted within 5 minutes of the timestamp. Override with `toleranceMs` if needed.
