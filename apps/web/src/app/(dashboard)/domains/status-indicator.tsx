import { DomainStatus } from "@prisma/client";

export const StatusIndicator: React.FC<{ status: DomainStatus }> = ({
  status,
}) => {
  let badgeColor = "bg-gray"; // Default color
  switch (status) {
    case DomainStatus.NOT_STARTED:
      badgeColor = "bg-gray";
      break;
    case DomainStatus.SUCCESS:
      badgeColor = "bg-green";
      break;
    case DomainStatus.FAILED:
      badgeColor = "bg-red";
      break;
    case DomainStatus.TEMPORARY_FAILURE:
    case DomainStatus.PENDING:
      badgeColor = "bg-yellow";
      break;
    default:
      badgeColor = "bg-gray";
  }

  return <div className={` w-[2px] ${badgeColor} my-1.5 rounded-full`}></div>;
};
