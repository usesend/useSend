"use client";

import { Webhook, WebhookCallStatus } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";
import { Badge } from "@usesend/ui/src/badge";
import { WebhookStatusBadge } from "../webhook-status-badge";

export function WebhookInfo({ webhook }: { webhook: Webhook }) {
  const [showSecret, setShowSecret] = useState(false);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const callsQuery = api.webhook.listCalls.useQuery({
    webhookId: webhook.id,
    limit: 50,
  });

  const calls = callsQuery.data?.items ?? [];
  const last7DaysCalls = calls.filter(
    (call) => new Date(call.createdAt) >= sevenDaysAgo,
  );

  const deliveredCount = last7DaysCalls.filter(
    (c) => c.status === WebhookCallStatus.DELIVERED,
  ).length;
  const failedCount = last7DaysCalls.filter(
    (c) => c.status === WebhookCallStatus.FAILED,
  ).length;
  const pendingCount = last7DaysCalls.filter(
    (c) =>
      c.status === WebhookCallStatus.PENDING ||
      c.status === WebhookCallStatus.IN_PROGRESS,
  ).length;

  const handleCopySecret = () => {
    navigator.clipboard.writeText(webhook.secret);
    toast.success("Secret copied to clipboard");
  };

  return (
    <div className="flex items-start gap-6 justify-between mt-5 mb-10">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Events</span>
        <div className="flex items-center gap-1 flex-wrap font-mono text-sm">
          {webhook.eventTypes.length === 0 ? (
            <span className="text-sm">All events</span>
          ) : (
            <>
              {webhook.eventTypes.slice(0, 2).map((event) => (
                <Badge key={event} variant="outline">
                  {event}
                </Badge>
              ))}
              {webhook.eventTypes.length > 2 && (
                <span className="text-xs text-muted-foreground">
                  +{webhook.eventTypes.length - 2} more
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Status</span>
        <div className="flex items-center">
          <WebhookStatusBadge status={webhook.status} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Created</span>
        <span className="text-sm">
          {formatDistanceToNow(webhook.createdAt, { addSuffix: true })}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Signing Secret</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSecret(!showSecret)}
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopySecret}
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <code className="text-xs bg-muted px-2 py-1 rounded font-mono w-[240px] inline-block truncate">
          {showSecret ? webhook.secret : "whsec_••••••••••••••••••••••••"}
        </code>
      </div>
    </div>
  );
}
