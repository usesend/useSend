"use client";

import { Button } from "@usesend/ui/src/button";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { Copy, RotateCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import { isSelfHosted } from "~/utils/common";

export const ResendTeamInvite: React.FC<{
  invite: { id: string; email: string };
}> = ({ invite }) => {
  const resendInviteMutation = api.team.resendTeamInvite.useMutation();

  async function onResendInvite() {
    resendInviteMutation.mutate(
      {
        inviteId: invite.id,
      },
      {
        onSuccess: async () => {
          toast.success(`Invite resent to ${invite.email}`);
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" onClick={onResendInvite}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Resend invite</p>
        </TooltipContent>
      </Tooltip>

      {isSelfHosted() ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${location.origin}/join-team?inviteId=${invite.id}`
                );
                toast.success(`Invite link copied to clipboard`);
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy invite link</p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </TooltipProvider>
  );
};

export default ResendTeamInvite;
