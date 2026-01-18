import { WebhookStatus } from "@prisma/client";

export function WebhookStatusBadge({ status }: { status: WebhookStatus }) {
  let badgeColor = "bg-gray-700/10 text-gray-400 border border-gray-400/10";
  let label: string = status;

  if (status === WebhookStatus.ACTIVE) {
    badgeColor = "bg-green/15 text-green border border-green/20";
    label = "Active";
  } else if (status === WebhookStatus.PAUSED) {
    badgeColor = "bg-yellow/15 text-yellow border border-yellow/20";
    label = "Paused";
  } else if (status === WebhookStatus.AUTO_DISABLED) {
    badgeColor = "bg-red/15 text-red border border-red/20";
    label = "Auto disabled";
  }

  return (
    <div
      className={`text-center w-[130px] rounded capitalize py-1 text-xs ${badgeColor}`}
    >
      {label}
    </div>
  );
}
