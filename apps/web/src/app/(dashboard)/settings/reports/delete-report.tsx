"use client";

import { api } from "~/trpc/react";
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
import { toast } from "@usesend/ui/src/toaster";

interface DeleteReportProps {
  report: { id: string; name: string };
}

export default function DeleteReport({ report }: DeleteReportProps) {
  const utils = api.useUtils();

  const deleteMutation = api.scheduledReport.delete.useMutation({
    onSuccess: () => {
      toast.success("Report deleted");
      utils.scheduledReport.list.invalidate();
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
          <AlertDialogTitle>Delete scheduled report</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{report.name}"? This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ id: report.id })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
