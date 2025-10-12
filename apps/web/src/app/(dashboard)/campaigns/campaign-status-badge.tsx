import { CampaignStatus } from "@prisma/client";

interface CampaignStatusBadgeProps {
  status: CampaignStatus;
}

export default function CampaignStatusBadge({
  status,
}: CampaignStatusBadgeProps) {
  const getStatusColor = (status: CampaignStatus) => {
    switch (status) {
      case CampaignStatus.DRAFT:
        return "bg-gray/15 text-gray border border-gray/20";
      case CampaignStatus.SENT:
        return "bg-green/15 text-green border border-green/20";
      case CampaignStatus.RUNNING:
        return "bg-blue/15 text-blue border border-blue/20";
      case CampaignStatus.PAUSED:
        return "bg-yellow/15 text-yellow border border-yellow/20";
      case CampaignStatus.SCHEDULED:
        return "bg-gray/15 text-gray border border-gray/20";
      default:
        return "bg-gray/15 text-gray border border-gray/20";
    }
  };

  return (
    <div
      className={`text-center min-w-[110px] rounded capitalize py-1 px-3 text-xs ${getStatusColor(
        status,
      )}`}
    >
      {status.toLowerCase()}
    </div>
  );
}
