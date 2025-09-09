import { DomainStatus } from "@prisma/client";

export const DomainStatusBadge: React.FC<{ status: DomainStatus }> = ({
  status,
}) => {
  let badgeColor = "bg-gray/10 text-gray border-gray/10"; // Default color
  switch (status) {
    case DomainStatus.SUCCESS:
      badgeColor = "bg-green/15 text-green border border-green/25";
      break;
    case DomainStatus.FAILED:
      badgeColor = "bg-red/10 text-red border border-red/10";
      break;
    case DomainStatus.TEMPORARY_FAILURE:
    case DomainStatus.PENDING:
      badgeColor = "bg-yellow/20 text-yellow border border-yellow/10";
      break;
    default:
      badgeColor = "bg-gray/70 text-gray border border-gray/20";
  }

  return (
    <div
      className={` text-center w-[120px] capitalize rounded-md py-1 justify-center flex items-center ${badgeColor}`}
    >
      <span className="text-xs">
        {status === "SUCCESS" ? "Verified" : status.toLowerCase()}
      </span>
    </div>
  );
};
