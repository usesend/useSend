"use client";

import { CampaignStatus } from "@prisma/client";
import { format } from "date-fns";
import Link from "next/link";

import DeleteCampaign from "./delete-campaign";
import DuplicateCampaign from "./duplicate-campaign";
import TogglePauseCampaign from "./toggle-pause-campaign";
import CampaignStatusBadge from "./campaign-status-badge";

interface CampaignCardProps {
  campaign: {
    id: string;
    name: string;
    subject: string;
    from: string;
    status: CampaignStatus;
    createdAt: Date;
    updatedAt: Date;
    scheduledAt?: Date | null;
    total: number;
    sent: number;
    delivered: number;
    unsubscribed: number;
  };
}

export default function CampaignCard({ campaign }: CampaignCardProps) {
  const sentPercentage =
    campaign.total > 0 ? Math.round((campaign.sent / campaign.total) * 100) : 0;
  const pendingCount = campaign.total - campaign.sent;

  return (
    <div className="border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header: Campaign name + status badge */}
      <div className="flex items-center justify-between ">
        <div className="w-1/3">
          <Link
            href={
              campaign.status === CampaignStatus.DRAFT ||
              campaign.status === CampaignStatus.SCHEDULED
                ? `/campaigns/${campaign.id}/edit`
                : `/campaigns/${campaign.id}`
            }
          >
            <div className="text-ellipsis text-sm font-medium underline decoration-dashed  underline-offset-2">
              {campaign.name}
            </div>
          </Link>

          <div className="text-sm font-mono  text-muted-foreground mt-2">
            {campaign.status === CampaignStatus.SCHEDULED ? (
              campaign.scheduledAt && (
                <div className="">
                  At{" "}
                  <strong>
                    {format(new Date(campaign.scheduledAt), "MMM do, hh:mm a")}
                  </strong>
                </div>
              )
            ) : campaign.status === CampaignStatus.SENT ? (
              <div className="flex items-center gap-1">
                <span>
                  Delivered <strong>{campaign.delivered}</strong>
                </span>
                <span>
                  • Unsubscribed <strong>{campaign.unsubscribed}</strong>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span>
                  Sent <strong>{campaign.sent}</strong>
                </span>
                {pendingCount > 0 && (
                  <span>
                    • Pending <strong>{pendingCount}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <CampaignStatusBadge status={campaign.status} />

        {/* Actions */}
        <div className="flex gap-4 items-center justify-end w-[150px]">
          {(campaign.status === CampaignStatus.SCHEDULED ||
            campaign.status === CampaignStatus.RUNNING ||
            campaign.status === CampaignStatus.PAUSED) && (
            <TogglePauseCampaign campaign={campaign} />
          )}
          <DuplicateCampaign campaign={campaign} />
          <DeleteCampaign campaign={campaign} />
        </div>
      </div>

      {/* Scheduled date for scheduled campaigns */}

      {/* Mini stats */}
    </div>
  );
}
