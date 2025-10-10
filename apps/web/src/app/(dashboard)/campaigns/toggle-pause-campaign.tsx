"use client";

import { Button } from "@usesend/ui/src/button";
import { api } from "~/trpc/react";
import React from "react";
import { Pause, Play } from "lucide-react";
import { Campaign, CampaignStatus } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";

export const TogglePauseCampaign: React.FC<{
  campaign: Partial<Campaign> & { id: string; status?: CampaignStatus };
}> = ({ campaign }) => {
  const utils = api.useUtils();
  const pauseMutation = api.campaign.pauseCampaign.useMutation();
  const resumeMutation = api.campaign.resumeCampaign.useMutation();

  const isPaused = campaign.status === CampaignStatus.PAUSED;

  const onToggle = () => {
    if (isPaused) {
      resumeMutation.mutate(
        { campaignId: campaign.id },
        {
          onSuccess: () => {
            utils.campaign.getCampaigns.invalidate();
            toast.success("Campaign resumed");
          },
        }
      );
    } else {
      pauseMutation.mutate(
        { campaignId: campaign.id },
        {
          onSuccess: () => {
            utils.campaign.getCampaigns.invalidate();
            toast.success("Campaign paused");
          },
        }
      );
    }
  };

  const pending = pauseMutation.isPending || resumeMutation.isPending;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="p-0 hover:bg-transparent"
      onClick={onToggle}
      disabled={pending}
      title={isPaused ? "Resume" : "Pause"}
    >
      {isPaused ? (
        <Play className="h-[18px] w-[18px] text-green/80" />
      ) : (
        <Pause className="h-[18px] w-[18px] text-orange/80" />
      )}
    </Button>
  );
};

export default TogglePauseCampaign;

