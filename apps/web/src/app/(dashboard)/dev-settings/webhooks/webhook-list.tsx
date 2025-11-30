"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";
import { formatDistanceToNow } from "date-fns";
import { Edit3, PlayCircle } from "lucide-react";
import { Button } from "@usesend/ui/src/button";
import { toast } from "@usesend/ui/src/toaster";
import { DeleteWebhook } from "./delete-webhook";
import { useState } from "react";
import { EditWebhookDialog } from "./webhook-update-dialog";

export function WebhookList() {
  const webhooksQuery = api.webhook.list.useQuery();
  const testWebhook = api.webhook.test.useMutation();
  const utils = api.useUtils();
  const [editingId, setEditingId] = useState<string | null>(null);

  const webhooks = webhooksQuery.data ?? [];

  async function handleTest(webhookId: string) {
    testWebhook.mutate(
      { id: webhookId },
      {
        onSuccess: async () => {
          await utils.webhook.listCalls.invalidate();
          toast.success("Test webhook enqueued");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  }

  return (
    <div className="mt-10">
      <div className="rounded-xl border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="rounded-tl-xl">URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Last success</TableHead>
              <TableHead>Last failure</TableHead>
              <TableHead className="rounded-tr-xl text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooksQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="py-4 text-center">
                  <Spinner
                    className="mx-auto h-6 w-6"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : webhooks.length === 0 ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="py-4 text-center">
                  <p>No webhooks configured</p>
                </TableCell>
              </TableRow>
            ) : (
              webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="max-w-xs truncate">
                    {webhook.url}
                  </TableCell>
                  <TableCell>
                    <WebhookStatusBadge status={webhook.status} />
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs">
                    {webhook.eventTypes.length === 0
                      ? "All events"
                      : webhook.eventTypes.join(", ")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {webhook.lastSuccessAt
                      ? formatDistanceToNow(webhook.lastSuccessAt, {
                          addSuffix: true,
                        })
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {webhook.lastFailureAt
                      ? formatDistanceToNow(webhook.lastFailureAt, {
                          addSuffix: true,
                        })
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTest(webhook.id)}
                        disabled={testWebhook.isPending}
                      >
                        <PlayCircle className="mr-1 h-4 w-4" />
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(webhook.id)}
                      >
                        <Edit3 className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <DeleteWebhook webhook={webhook} />
                    </div>
                    {editingId === webhook.id ? (
                      <EditWebhookDialog
                        webhook={webhook}
                        open={editingId === webhook.id}
                        onOpenChange={(open) =>
                          setEditingId(open ? webhook.id : null)
                        }
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function WebhookStatusBadge({ status }: { status: string }) {
  let badgeColor = "bg-gray-700/10 text-gray-400 border border-gray-400/10";
  let label = status;

  if (status === "ACTIVE") {
    badgeColor = "bg-green/15 text-green border border-green/20";
    label = "Active";
  } else if (status === "PAUSED") {
    badgeColor = "bg-gray-700/10 text-gray-400 border border-gray-400/10";
    label = "Paused";
  } else if (status === "AUTO_DISABLED") {
    badgeColor = "bg-red/15 text-red border border-red/20";
    label = "Auto disabled";
  }

  return (
    <div
      className={`text-center w-[130px] rounded capitalize py-1 text-xs ${badgeColor}`}
    >
      {label}
    </div>
  );
}
