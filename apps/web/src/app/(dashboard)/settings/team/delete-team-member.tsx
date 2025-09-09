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
import { Role } from "@prisma/client";
import { LogOut, Trash2 } from "lucide-react";

export const DeleteTeamMember: React.FC<{
  teamUser: { userId: string; role: Role; email: string };
  self: boolean;
}> = ({ teamUser, self }) => {
  const [open, setOpen] = useState(false);
  const deleteTeamUserMutation = api.team.deleteTeamUser.useMutation();

  const utils = api.useUtils();

  async function onTeamUserDelete() {
    deleteTeamUserMutation.mutate(
      {
        userId: teamUser.userId,
      },
      {
        onSuccess: async () => {
          utils.team.getTeamUsers.invalidate();
          setOpen(false);
          toast.success("Team member removed successfully");
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
          {self ? (
            <LogOut className="h-4 w-4 text-red/80" />
          ) : (
            <Trash2 className="h-4 w-4 text-red/80" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {self ? "Leave Team" : "Remove Team Member"}
          </DialogTitle>
          <DialogDescription>
            {self
              ? "Are you sure you want to leave the team? This action cannot be undone."
              : `Are you sure you want to remove ${teamUser.email} from the team? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-4 mt-6">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onTeamUserDelete}
            isLoading={deleteTeamUserMutation.isPending}
            className="w-[150px]"
          >
            {self ? "Leave" : "Remove"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteTeamMember;
