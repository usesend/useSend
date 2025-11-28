"use client";

import { Webhook, WebhookCallStatus } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";

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

  const eventsText =
    webhook.eventTypes.length === 0
      ? "All events"
      : `${webhook.eventTypes.length} event${webhook.eventTypes.length === 1 ? "" : "s"}`;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">URL</span>
            <span className="text-sm font-mono break-all">{webhook.url}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Events</span>
              <span className="text-sm">{eventsText}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">
                {formatDistanceToNow(webhook.createdAt, { addSuffix: true })}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Signing Secret
              </span>
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
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">
              {showSecret ? webhook.secret : "whsec_••••••••••••••••••••••••"}
            </code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Last 7 Days Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-around h-[140px]">
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-green">
                {deliveredCount}
              </span>
              <span className="text-sm text-muted-foreground">Delivered</span>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-red">{failedCount}</span>
              <span className="text-sm text-muted-foreground">Failed</span>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-yellow">
                {pendingCount}
              </span>
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
