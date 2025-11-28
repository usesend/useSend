"use client";

import { H1 } from "@usesend/ui";
import { AddWebhook } from "./add-webhook";
import { WebhookList } from "./webhook-list";

export default function WebhooksPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <H1>Webhooks</H1>
        <AddWebhook />
      </div>
      <WebhookList />
    </div>
  );
}
