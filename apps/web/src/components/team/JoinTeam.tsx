"use client";

import { Button } from "@usesend/ui/src/button";
import { Spinner } from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@usesend/ui/src/toaster";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import { useState } from "react";
import type { AppRouter } from "~/server/api/root";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Invite = NonNullable<
  RouterOutputs["invitation"]["getUserInvites"]
>[number];

export default function JoinTeam({
  showCreateTeam = false,
}: {
  showCreateTeam?: boolean;
}) {
  const searchParams = useSearchParams();
  const inviteId = searchParams.get("inviteId");

  const { data: invites, status: invitesStatus } =
    api.invitation.getUserInvites.useQuery({
      inviteId,
    });
  const joinTeamMutation = api.invitation.acceptTeamInvite.useMutation();
  const [selectedInvite, setSelectedInvite] = useState<Invite | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const utils = api.useUtils();
  const router = useRouter();

  const handleAcceptInvite = (invite: Invite) => {
    setSelectedInvite(invite);
    setDialogOpen(true);
  };

  const confirmAcceptInvite = () => {
    if (!selectedInvite) return;

    joinTeamMutation.mutate(
      {
        inviteId: selectedInvite.id,
      },
      {
        onSuccess: async () => {
          toast.success(`Successfully joined ${selectedInvite.team.name}`);
          await Promise.all([
            utils.invitation.getUserInvites.invalidate(),
            utils.team.getTeams.invalidate(),
          ]);
          setDialogOpen(false);
          router.replace("/dashboard");
        },
        onError: (error) => {
          toast.error(`Failed to join team: ${error.message}`);
          setDialogOpen(false);
        },
      }
    );
  };

  if (!invites?.length) {
    return !showCreateTeam ? (
      <div className="text-center text-xl">No invites found</div>
    ) : null;
  }

  return (
    <div>
      <div>You have been invited to join team</div>
      <div className="space-y-2 mt-4">
        {invites.map((invite) => (
          <div
            key={invite.id}
            className="flex items-center gap-2 border rounded-lg p-2 px-4 shadow justify-between"
          >
            <div>
              <div className="text-sm">{invite.team.name}</div>
              <div className="flex items-center gap-2">
                <div className="text-muted-foreground text-xs capitalize">
                  {invite.role.toLowerCase()}
                </div>
                <div className="text-muted-foreground text-xs">
                  {invite.createdAt.toLocaleDateString()}
                </div>
              </div>
            </div>
            <Button
              onClick={() => handleAcceptInvite(invite)}
              disabled={joinTeamMutation.isPending}
              size="sm"
              variant="ghost"
            >
              {joinTeamMutation.isPending ? (
                <Spinner className="w-5 h-5" />
              ) : (
                "Accept"
              )}
            </Button>
          </div>
        ))}
      </div>
      {showCreateTeam ? (
        <div className="mt-8 text-muted-foreground text-sm font-mono text-center">
          OR
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Team Invitation</DialogTitle>
            <DialogDescription>
              Are you sure you want to join{" "}
              <span className="font-semibold text-foreground">
                {selectedInvite?.team.name}
              </span>
              ? You will be added as a{" "}
              <span className="font-semibold text-foreground lowercase">
                {selectedInvite?.role.toLowerCase()}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={joinTeamMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAcceptInvite}
              disabled={joinTeamMutation.isPending}
            >
              {joinTeamMutation.isPending ? (
                <Spinner className="w-5 h-5" />
              ) : (
                "Accept Invitation"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
