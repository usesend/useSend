"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { formatDistanceToNow } from "date-fns";
import { api } from "~/trpc/react";
import DeleteWebhook from "./delete-webhook";
import Spinner from "@usesend/ui/src/spinner";
import { Badge } from "@usesend/ui/src/badge";
import { Switch } from "@usesend/ui/src/switch";
import { Button } from "@usesend/ui/src/button";
import { PlayCircle, ExternalLink } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";
import { useState } from "react";
import Link from "next/link";

export default function WebhookList() {
  const webhooksQuery = api.webhook.list.useQuery();
  const utils = api.useUtils();
  const updateMutation = api.webhook.update.useMutation({
    onSuccess: () => {
      utils.webhook.list.invalidate();
    },
  });
  const testMutation = api.webhook.test.useMutation();
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleToggle = (id: string, enabled: boolean) => {
    updateMutation.mutate({ id, enabled });
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testMutation.mutateAsync({ id });
      if (result.success) {
        toast.success(`Test successful (${result.statusCode})`);
      } else {
        toast.error(`Test failed: ${result.response}`);
      }
    } catch {
      toast.error("Failed to test webhook");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="mt-6">
      <div className="border rounded-xl shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="rounded-tl-xl">Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Deliveries</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="rounded-tr-xl">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooksQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={7} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : webhooksQuery.data?.length === 0 ? (
              <TableRow className="h-32">
                <TableCell colSpan={7} className="text-center py-4">
                  <p>No webhooks configured</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create a webhook to receive real-time email event
                    notifications.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              webhooksQuery.data?.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dev-settings/webhooks/${webhook.id}`}
                      className="hover:underline"
                    >
                      {webhook.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {webhook.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.slice(0, 3).map((event) => (
                        <Badge key={event} variant="secondary" className="text-xs">
                          {event}
                        </Badge>
                      ))}
                      {webhook.events.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{webhook.events.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{webhook.deliveryCount}</TableCell>
                  <TableCell>
                    <Switch
                      checked={webhook.enabled}
                      onCheckedChange={(checked) =>
                        handleToggle(webhook.id, checked)
                      }
                      disabled={updateMutation.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(webhook.createdAt, { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTest(webhook.id)}
                        disabled={testingId === webhook.id}
                      >
                        {testingId === webhook.id ? (
                          <Spinner className="w-4 h-4" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                      </Button>
                      <Link href={`/dev-settings/webhooks/${webhook.id}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                      <DeleteWebhook webhook={webhook} />
                    </div>
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
