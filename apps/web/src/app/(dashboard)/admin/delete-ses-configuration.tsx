"use client";

import { useState } from "react";
import { SesSetting } from "@prisma/client";
import { Trash } from "lucide-react";

import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import { toast } from "@usesend/ui/src/toaster";

import { api } from "~/trpc/react";

export default function DeleteSesConfiguration({
  setting,
}: {
  setting: SesSetting;
}) {
  const [open, setOpen] = useState(false);

  const deleteSesSettings = api.admin.deleteSesSettings.useMutation();
  const utils = api.useUtils();

  const handleDelete = () => {
    deleteSesSettings.mutate(
      { settingsId: setting.id },
      {
        onSuccess: () => {
          utils.admin.invalidate();
          toast.success("SES configuration deleted", {
            description: `${setting.region} has been removed`,
          });
          setOpen(false);
        },
        onError: (error) => {
          toast.error("Failed to delete SES configuration", {
            description: error.message,
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          <Trash className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete SES configuration</DialogTitle>
          <DialogDescription>
            This will delete the callback URL, SNS topic, and queues for the{" "}
            <span className="font-semibold">{setting.region}</span> region.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={deleteSesSettings.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            isLoading={deleteSesSettings.isPending}
            showSpinner
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
