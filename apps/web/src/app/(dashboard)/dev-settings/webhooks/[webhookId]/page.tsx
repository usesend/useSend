"use client";

import { use, useState } from "react";
import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
import { Button } from "@usesend/ui/src/button";
import { Badge } from "@usesend/ui/src/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { ArrowLeft, RefreshCw, PlayCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "@usesend/ui/src/toaster";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@usesend/ui/src/alert-dialog";

export default function WebhookDetailPage({
  params,
}: {
  params: Promise<{ webhookId: string }>;
}) {
  const { webhookId } = use(params);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const webhookQuery = api.webhook.get.useQuery({ id: webhookId });
  const deliveriesQuery = api.webhook.getDeliveries.useQuery({
    webhookId,
    limit: 50,
  });
  const testMutation = api.webhook.test.useMutation();
  const regenerateMutation = api.webhook.regenerateSecret.useMutation();
  const utils = api.useUtils();

  const handleTest = async () => {
    try {
      const result = await testMutation.mutateAsync({ id: webhookId });
      if (result.success) {
        toast.success(`Test successful (${result.statusCode})`);
      } else {
        toast.error(`Test failed: ${result.response}`);
      }
    } catch {
      toast.error("Failed to test webhook");
    }
  };

  const handleRegenerateSecret = async () => {
    try {
      const result = await regenerateMutation.mutateAsync({ id: webhookId });
      setNewSecret(result.secret);
      utils.webhook.get.invalidate({ id: webhookId });
      toast.success("Secret regenerated");
    } catch {
      toast.error("Failed to regenerate secret");
    }
  };

  if (webhookQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (!webhookQuery.data) {
    return (
      <div className="text-center py-12">
        <p>Webhook not found</p>
        <Link href="/dev-settings/webhooks">
          <Button variant="link">Back to webhooks</Button>
        </Link>
      </div>
    );
  }

  const webhook = webhookQuery.data;

  return (
    <div className="space-y-6 mt-9 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dev-settings/webhooks">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{webhook.name}</h2>
          <p className="text-sm text-muted-foreground truncate max-w-md">
            {webhook.url}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <Spinner className="w-4 h-4 mr-2" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-2" />
            )}
            Test
          </Button>
        </div>
      </div>

      {newSecret && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-4">
            <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
              New secret generated - save it now!
            </p>
            <code className="block p-2 bg-white dark:bg-black rounded text-sm font-mono break-all">
              {newSecret}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                navigator.clipboard.writeText(newSecret);
                toast.success("Copied to clipboard");
              }}
            >
              Copy Secret
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Status
              </label>
              <div className="mt-1">
                <Badge variant={webhook.enabled ? "default" : "secondary"}>
                  {webhook.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Events
              </label>
              <div className="flex flex-wrap gap-1 mt-1">
                {webhook.events.map((event) => (
                  <Badge key={event} variant="outline">
                    {event}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Created
              </label>
              <p className="text-sm mt-1">
                {format(webhook.createdAt, "PPp")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Signing Secret
              </label>
              <p className="text-sm mt-1 font-mono">
                {webhook.secretPreview}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <KeyRound className="h-4 w-4 mr-2" />
                  Regenerate Secret
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate secret?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will invalidate the current secret. Make sure to update
                    your endpoint with the new secret.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRegenerateSecret}>
                    {regenerateMutation.isPending
                      ? "Regenerating..."
                      : "Regenerate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Deliveries</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deliveriesQuery.refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${deliveriesQuery.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveriesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Spinner className="w-5 h-5 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : deliveriesQuery.data?.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No deliveries yet
                  </TableCell>
                </TableRow>
              ) : (
                deliveriesQuery.data?.items.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      <Badge variant="outline">{delivery.eventType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          delivery.status === "SUCCESS"
                            ? "default"
                            : delivery.status === "PENDING"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {delivery.status}
                        {delivery.statusCode ? ` (${delivery.statusCode})` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {delivery.response || "-"}
                    </TableCell>
                    <TableCell>{delivery.attempts}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(delivery.createdAt, {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
