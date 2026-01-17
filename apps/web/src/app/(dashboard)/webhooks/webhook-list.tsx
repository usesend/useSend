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
import { Edit3, MoreVertical, Pause, Play } from "lucide-react";
import { Button } from "@usesend/ui/src/button";
import { toast } from "@usesend/ui/src/toaster";
import { DeleteWebhook } from "./delete-webhook";
import { useState } from "react";
import { EditWebhookDialog } from "./webhook-update-dialog";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { type Webhook } from "@prisma/client";
import { WebhookStatusBadge } from "./webhook-status-badge";

export function WebhookList() {
  const webhooksQuery = api.webhook.list.useQuery();
  const testWebhook = api.webhook.test.useMutation();
  const setStatusMutation = api.webhook.setStatus.useMutation();
  const utils = api.useUtils();
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  const webhooks = webhooksQuery.data ?? [];

  async function handleToggleStatus(webhookId: string, currentStatus: string) {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setStatusMutation.mutate(
      { id: webhookId, status: newStatus },
      {
        onSuccess: async () => {
          await utils.webhook.list.invalidate();
          toast.success(
            `Webhook ${newStatus === "ACTIVE" ? "resumed" : "paused"}`,
          );
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
                <TableCell colSpan={5} className="py-4 text-center">
                  <Spinner
                    className="mx-auto h-6 w-6"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : webhooks.length === 0 ? (
              <TableRow className="h-32">
                <TableCell colSpan={5} className="py-4 text-center">
                  <p>No webhooks configured</p>
                </TableCell>
              </TableRow>
            ) : (
              webhooks.map((webhook) => (
                <TableRow
                  key={webhook.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/webhooks/${webhook.id}`)}
                >
                  <TableCell className="max-w-xs truncate ">
                    {webhook.url}
                  </TableCell>
                  <TableCell>
                    <WebhookStatusBadge status={webhook.status} />
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
                    <div
                      className="flex items-center justify-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <WebhookActions
                        webhook={webhook}
                        onEdit={() => setEditingId(webhook.id)}
                        onToggleStatus={() =>
                          handleToggleStatus(webhook.id, webhook.status)
                        }
                        isToggling={setStatusMutation.isPending}
                      />
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

function WebhookActions({
  webhook,
  onEdit,
  onToggleStatus,
  isToggling,
}: {
  webhook: Webhook;
  onEdit: () => void;
  onToggleStatus: () => void;
  isToggling: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isPaused = webhook.status === "PAUSED";
  const isAutoDisabled = webhook.status === "AUTO_DISABLED";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 rounded-xl p-1" align="end">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            className="justify-start rounded-lg hover:bg-accent"
            onClick={() => {
              onEdit();
              setOpen(false);
            }}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start rounded-lg hover:bg-accent"
            onClick={() => {
              onToggleStatus();
              setOpen(false);
            }}
            disabled={isToggling || isAutoDisabled}
          >
            {isPaused ? (
              <>
                <Play className="mr-2 h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            )}
          </Button>
          <DeleteWebhook webhook={webhook} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
