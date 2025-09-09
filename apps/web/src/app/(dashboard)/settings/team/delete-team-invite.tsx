"use client";

import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import { api } from "~/trpc/react";
import { useState } from "react";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";

export const DeleteTeamInvite: React.FC<{
  invite: { id: string; email: string };
}> = ({ invite }) => {
  const [open, setOpen] = useState(false);
  const deleteInviteMutation = api.team.deleteTeamInvite.useMutation();

  const utils = api.useUtils();

  async function onInviteDelete() {
    deleteInviteMutation.mutate(
      {
        inviteId: invite.id,
      },
      {
        onSuccess: async () => {
          utils.team.getTeamInvites.invalidate();
          setOpen(false);
          toast.success("Invite cancelled successfully");
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4 text-red/80" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Invite</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel the invite for{" "}
            <span className="font-semibold text-foreground">
              {invite.email}
            </span>
            ?
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-4 mt-6">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            isLoading={deleteInviteMutation.isPending}
            onClick={onInviteDelete}
            className="w-[150px]"
          >
            Delete Invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteTeamInvite;
