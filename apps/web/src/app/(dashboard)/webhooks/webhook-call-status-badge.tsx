import { WebhookCallStatus } from "@prisma/client";

export function WebhookCallStatusBadge({
  status,
}: {
  status: WebhookCallStatus;
}) {
  let badgeColor = "bg-gray-700/10 text-gray-400 border border-gray-400/10";
  let label: string = status;

  switch (status) {
    case WebhookCallStatus.DELIVERED:
      badgeColor = "bg-green/15 text-green border border-green/20";
      label = "Delivered";
      break;
    case WebhookCallStatus.FAILED:
      badgeColor = "bg-red/15 text-red border border-red/20";
      label = "Failed";
      break;
    case WebhookCallStatus.PENDING:
      badgeColor = "bg-yellow/20 text-yellow border border-yellow/10";
      label = "Pending";
      break;
    case WebhookCallStatus.IN_PROGRESS:
      badgeColor = "bg-blue/15 text-blue border border-blue/20";
      label = "In Progress";
      break;
    case WebhookCallStatus.DISCARDED:
      badgeColor = "bg-gray-700/10 text-gray-400 border border-gray-400/10";
      label = "Discarded";
      break;
  }

  return (
    <div
      className={`text-center w-[110px] rounded capitalize py-1 text-xs ${badgeColor}`}
    >
      {label}
    </div>
  );
}
