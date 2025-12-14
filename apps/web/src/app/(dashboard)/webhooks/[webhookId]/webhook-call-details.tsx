"use client";

import { formatDate } from "date-fns";
import { RefreshCw } from "lucide-react";
import { Button } from "@usesend/ui/src/button";
import { Separator } from "@usesend/ui/src/separator";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { WebhookCallStatusBadge } from "../webhook-call-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import { CodeDisplay } from "~/components/code-display";

export function WebhookCallDetails({ callId }: { callId: string }) {
  const callQuery = api.webhook.getCall.useQuery({ id: callId });
  const retryMutation = api.webhook.retryCall.useMutation();
  const utils = api.useUtils();

  const call = callQuery.data;

  if (!call) {
    return (
      <Card className="h-full">
        <CardContent className="p-6 flex items-center justify-center h-full">
          <p className="text-muted-foreground text-sm">
            Loading call details...
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleRetry = () => {
    retryMutation.mutate(
      { id: call.id },
      {
        onSuccess: async () => {
          await utils.webhook.listCalls.invalidate();
          await utils.webhook.getCall.invalidate();
          toast.success("Webhook call queued for retry");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(call.payload);
  } catch {
    parsedPayload = call.payload;
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 border-b bg-muted/20">
        <CardTitle className="text-base font-medium">Call Details</CardTitle>
        {call.status === "FAILED" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retryMutation.isPending}
            className="h-8"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Retry
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Status
            </span>
            <div>
              <WebhookCallStatusBadge status={call.status} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Event Type
            </span>
            <span className="text-sm font-mono">{call.type}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Timestamp
            </span>
            <span className="text-sm">
              {formatDate(call.createdAt, "MMM dd, yyyy HH:mm:ss")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Attempt
            </span>
            <span className="text-sm">{call.attempt}</span>
          </div>

          {call.responseStatus && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Response Status
              </span>
              <span className="text-sm font-mono">{call.responseStatus}</span>
            </div>
          )}

          {call.responseTimeMs && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Duration
              </span>
              <span className="text-sm">{call.responseTimeMs}ms</span>
            </div>
          )}
        </div>

        {call.lastError && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider text-red-500">
              Error
            </span>
            <div className="text-xs bg-red-500/10 border border-red-500/20 rounded-md p-3 font-mono text-red-600 dark:text-red-400">
              {call.lastError}
            </div>
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-3">
          <h4 className="font-medium text-sm">Request Payload</h4>
          <CodeDisplay
            code={JSON.stringify(parsedPayload, null, 2)}
            language="json"
          />
        </div>

        {call.responseText && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <h4 className="font-medium text-sm">Response Body</h4>
              <CodeDisplay code={call.responseText} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
