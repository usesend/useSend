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

interface DeleteSegmentProps {
  segment: { id: string; name: string };
  contactBookId: string;
}

export default function DeleteSegment({
  segment,
  contactBookId,
}: DeleteSegmentProps) {
  const utils = api.useUtils();

  const deleteMutation = api.segment.delete.useMutation({
    onSuccess: () => {
      toast.success("Segment deleted");
      utils.segment.list.invalidate({ contactBookId });
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
          <AlertDialogTitle>Delete segment</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{segment.name}"? This action cannot
            be undone. The contacts in this segment will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              deleteMutation.mutate({ contactBookId, segmentId: segment.id })
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
