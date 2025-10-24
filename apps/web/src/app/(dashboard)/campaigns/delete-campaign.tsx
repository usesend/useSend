"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { Campaign } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";
import { z } from "zod";

export const DeleteCampaign: React.FC<{
  campaign: Partial<Campaign> & { id: string };
}> = ({ campaign }) => {
  const deleteCampaignMutation = api.campaign.deleteCampaign.useMutation();
  const utils = api.useUtils();

  const campaignSchema = z
    .object({
      confirmation: z
        .string()
        .min(1, "Please type the campaign name to confirm"),
    })
    .refine((data) => data.confirmation === campaign.name, {
      message: "Campaign name does not match",
      path: ["confirmation"],
    });

  async function onCampaignDelete(values: z.infer<typeof campaignSchema>) {
    deleteCampaignMutation.mutate(
      {
        campaignId: campaign.id,
      },
      {
        onSuccess: () => {
          utils.campaign.getCampaigns.invalidate();
          toast.success(`Campaign deleted`);
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Delete Campaign"
      resourceName={campaign.name || ""}
      schema={campaignSchema}
      isLoading={deleteCampaignMutation.isPending}
      onConfirm={onCampaignDelete}
      trigger={
        <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent">
          <Trash2 className="h-[18px] w-[18px] text-red/80" />
        </Button>
      }
      confirmLabel="Delete Campaign"
    />
  );
};

export default DeleteCampaign;
