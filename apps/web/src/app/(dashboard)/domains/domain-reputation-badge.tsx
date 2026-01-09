"use client";

import { api } from "~/trpc/react";
import {
  CheckCircle2Icon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import {
  HARD_BOUNCE_RISK_RATE,
  HARD_BOUNCE_WARNING_RATE,
  COMPLAINED_WARNING_RATE,
  COMPLAINED_RISK_RATE,
} from "~/lib/constants";

type ReputationStatus = "HEALTHY" | "WARNING" | "RISK";

function getReputationStatus(
  bounceRate: number,
  complaintRate: number
): ReputationStatus {
  if (
    bounceRate > HARD_BOUNCE_RISK_RATE ||
    complaintRate > COMPLAINED_RISK_RATE
  ) {
    return "RISK";
  }
  if (
    bounceRate > HARD_BOUNCE_WARNING_RATE ||
    complaintRate > COMPLAINED_WARNING_RATE
  ) {
    return "WARNING";
  }
  return "HEALTHY";
}

export function DomainReputationBadge({ domainId }: { domainId: number }) {
  const { data: metrics, isLoading } =
    api.dashboard.reputationMetricsData.useQuery({
      domain: domainId,
    });

  if (isLoading) {
    return (
      <div className="h-6 w-16 bg-muted/50 animate-pulse rounded-md" />
    );
  }

  if (!metrics || metrics.delivered === 0) {
    return (
      <div className="text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted/30">
        No data
      </div>
    );
  }

  const status = getReputationStatus(metrics.bounceRate, metrics.complaintRate);

  const StatusIcon =
    status === "HEALTHY"
      ? CheckCircle2Icon
      : status === "WARNING"
        ? TriangleAlertIcon
        : OctagonAlertIcon;

  const className =
    status === "HEALTHY"
      ? "text-success bg-success/10 border-success/20"
      : status === "WARNING"
        ? "text-warning bg-warning/10 border-warning/20"
        : "text-destructive bg-destructive/10 border-destructive/20";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${className}`}
          >
            <StatusIcon className="h-3 w-3" />
            <span className="capitalize">{status.toLowerCase()}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="w-[200px]">
          <div className="flex flex-col gap-1 text-xs">
            <div className="font-medium mb-1">Domain Reputation</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bounce Rate:</span>
              <span className="font-mono">{metrics.bounceRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Complaint Rate:</span>
              <span className="font-mono">{metrics.complaintRate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Delivered:</span>
              <span className="font-mono">{metrics.delivered.toLocaleString()}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
