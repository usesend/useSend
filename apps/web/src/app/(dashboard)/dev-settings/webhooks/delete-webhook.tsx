"use client";

import { Button } from "@usesend/ui/src/button";
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
import { Trash2 } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";

interface DeleteWebhookProps {
  webhook: {
    id: string;
    name: string;
  };
}

export default function DeleteWebhook({ webhook }: DeleteWebhookProps) {
  const utils = api.useUtils();
  const deleteMutation = api.webhook.delete.useMutation({
    onSuccess: () => {
      utils.webhook.list.invalidate();
      toast.success("Webhook deleted");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete webhook</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{webhook.name}"? This action cannot
            be undone and you will stop receiving event notifications.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ id: webhook.id })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
