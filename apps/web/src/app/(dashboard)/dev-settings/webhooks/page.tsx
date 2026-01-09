"use client";

import AddWebhook from "./add-webhook";
import WebhookList from "./webhook-list";

export default function WebhooksPage() {
  return (
    <div className="space-y-6 mt-9 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Webhooks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Receive real-time notifications when email events occur.
          </p>
        </div>
        <AddWebhook />
      </div>
      <WebhookList />
    </div>
  );
}
