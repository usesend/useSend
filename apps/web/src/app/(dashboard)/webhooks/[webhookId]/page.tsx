"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@usesend/ui/src/breadcrumb";
import { Button } from "@usesend/ui/src/button";
import {
  Edit3,
  Key,
  MoreVertical,
  Pause,
  Play,
  TestTube,
  CircleEllipsis,
} from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";
import { WebhookInfo } from "./webhook-info";
import { WebhookCallsTable } from "./webhook-calls-table";
import { WebhookCallDetails } from "./webhook-call-details";
import { DeleteWebhook } from "../delete-webhook";
import { EditWebhookDialog } from "../webhook-update-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { type Webhook } from "@prisma/client";

function WebhookDetailActions({
  webhook,
  onTest,
  onEdit,
  onToggleStatus,
  onRotateSecret,
  isTestPending,
  isToggling,
  isRotating,
}: {
  webhook: Webhook;
  onTest: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onRotateSecret: () => void;
  isTestPending: boolean;
  isToggling: boolean;
  isRotating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isPaused = webhook.status === "PAUSED";
  const isAutoDisabled = webhook.status === "AUTO_DISABLED";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" className="gap-1">
          <MoreVertical className="h-4 -ml-2" />
          Actions
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 rounded-xl p-1" align="end">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            className="justify-start rounded-lg hover:bg-accent"
            onClick={() => {
              onTest();
              setOpen(false);
            }}
            disabled={isTestPending}
          >
            <TestTube className="mr-2 h-4 w-4" />
            Test webhook
          </Button>
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
          <Button
            variant="ghost"
            size="sm"
            className="justify-start rounded-lg hover:bg-accent"
            onClick={() => {
              onRotateSecret();
              setOpen(false);
            }}
            disabled={isRotating}
          >
            <Key className="mr-2 h-4 w-4" />
            Rotate secret
          </Button>
          <DeleteWebhook webhook={webhook} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function WebhookDetailPage({
  params,
}: {
  params: Promise<{ webhookId: string }>;
}) {
  const { webhookId } = use(params);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const webhookQuery = api.webhook.getById.useQuery({ id: webhookId });
  const testWebhook = api.webhook.test.useMutation();
  const setStatusMutation = api.webhook.setStatus.useMutation();
  const updateWebhook = api.webhook.update.useMutation();
  const callsQuery = api.webhook.listCalls.useQuery({
    webhookId,
    limit: 50,
  });
  const utils = api.useUtils();

  const webhook = webhookQuery.data;

  useEffect(() => {
    if (!selectedCallId && callsQuery.data?.items.length) {
      setSelectedCallId(callsQuery.data.items[0]!.id);
    }
  }, [callsQuery.data, selectedCallId]);

  const handleTest = () => {
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
  };

  const handleToggleStatus = (currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setStatusMutation.mutate(
      { id: webhookId, status: newStatus },
      {
        onSuccess: async () => {
          await utils.webhook.getById.invalidate();
          toast.success(
            `Webhook ${newStatus === "ACTIVE" ? "resumed" : "paused"}`,
          );
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  const handleRotateSecret = () => {
    updateWebhook.mutate(
      { id: webhookId, rotateSecret: true },
      {
        onSuccess: async () => {
          await utils.webhook.getById.invalidate();
          toast.success("Secret rotated successfully");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  if (webhookQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading webhook...</p>
      </div>
    );
  }

  if (!webhook) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Webhook not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/webhooks" className="text-lg">
                  Webhooks
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-lg" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-lg max-w-[500px] truncate">
                {webhook.url}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <WebhookDetailActions
          webhook={webhook}
          onTest={handleTest}
          onEdit={() => setIsEditDialogOpen(true)}
          onToggleStatus={() => handleToggleStatus(webhook.status)}
          onRotateSecret={handleRotateSecret}
          isTestPending={testWebhook.isPending}
          isToggling={setStatusMutation.isPending}
          isRotating={updateWebhook.isPending}
        />
      </div>

      <WebhookInfo webhook={webhook} />

      <div className="h-[calc(100vh-280px)] min-h-[600px] flex gap-6">
        <div className="w-1/2 flex flex-col">
          <WebhookCallsTable
            webhookId={webhookId}
            selectedCallId={selectedCallId}
            onSelectCall={setSelectedCallId}
          />
        </div>

        <div className="w-1/2 overflow-auto">
          {selectedCallId ? (
            <WebhookCallDetails callId={selectedCallId} />
          ) : (
            <div className="h-full flex items-center justify-center border rounded-xl bg-muted/10 border-dashed text-muted-foreground">
              Select a webhook call to view details
            </div>
          )}
        </div>
      </div>

      {isEditDialogOpen && (
        <EditWebhookDialog
          webhook={webhook}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
        />
      )}
    </div>
  );
}
