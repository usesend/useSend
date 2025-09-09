import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import {
  CheckCircle2,
  CheckCircle2Icon,
  InfoIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  YAxis,
} from "recharts";
import {
  HARD_BOUNCE_RISK_RATE,
  HARD_BOUNCE_WARNING_RATE,
  COMPLAINED_WARNING_RATE,
  COMPLAINED_RISK_RATE,
} from "~/lib/constants";
import { api } from "~/trpc/react";
import { useColors } from "./hooks/useColors";

interface ReputationMetricsProps {
  days: number;
  domain: string | null;
}

enum ACCOUNT_STATUS {
  HEALTHY = "HEALTHY",
  WARNING = "WARNING",
  RISK = "RISK",
}

const CustomLabel = ({ value, stroke }: { value: string; stroke: string }) => {
  return (
    <text x={0} y={-5} fill={stroke} fontSize={12} textAnchor="start">
      {value}
    </text>
  );
};

export function ReputationMetrics({ days, domain }: ReputationMetricsProps) {
  const { data: metrics, isLoading } =
    api.dashboard.reputationMetricsData.useQuery({
      domain: domain ? Number(domain) : undefined,
    });

  const colors = useColors();

  const bouncedMetric = metrics
    ? [
        {
          name: "Bounce Rate",
          value: metrics.bounceRate,
        },
      ]
    : [];

  const complaintMetric = metrics
    ? [
        {
          name: "Complaint Rate",
          value: metrics.complaintRate,
        },
      ]
    : [];

  const bounceStatus =
    (metrics?.bounceRate ?? 0) > HARD_BOUNCE_RISK_RATE
      ? ACCOUNT_STATUS.RISK
      : (metrics?.bounceRate ?? 0) > HARD_BOUNCE_WARNING_RATE
        ? ACCOUNT_STATUS.WARNING
        : ACCOUNT_STATUS.HEALTHY;

  const complaintStatus =
    (metrics?.complaintRate ?? 0) > COMPLAINED_RISK_RATE
      ? ACCOUNT_STATUS.RISK
      : (metrics?.complaintRate ?? 0) > COMPLAINED_WARNING_RATE
        ? ACCOUNT_STATUS.WARNING
        : ACCOUNT_STATUS.HEALTHY;

  return (
    <TooltipProvider>
      <div className="flex gap-10 w-full">
        <div className="w-1/2 border rounded-xl shadow p-4">
          <div className="flex justify-between">
            <div className=" flex items-center gap-2">
              <div className="text-muted-foreground font-mono">Bounce Rate</div>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className=" h-3.5  w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="w-[300px]">
                  The percentage of emails sent from your account that resulted
                  in a hard bounce.
                </TooltipContent>
              </Tooltip>
            </div>
            <div></div>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="text-2xl mt-2 font-mono">
              {metrics?.bounceRate.toFixed(2)}%
            </div>
            <StatusBadge status={bounceStatus} />
          </div>
          {/* <div className="flex">
            <StatusBadge status={ACCOUNT_STATUS.HEALTHY} />
          </div> */}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              // width={350}
              // height={100}
              data={bouncedMetric}
              margin={{
                top: 20,
                // right: 30,
                left: -30,
                bottom: 5,
              }}
            >
              <YAxis
                domain={[0, 15]}
                ticks={[0, 5, 10, 15]}
                fontSize={12}
                tickFormatter={(value) => `${value}%`}
                hide={false}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke={`${colors.xaxis}50`}
              />
              <ReferenceLine
                y={HARD_BOUNCE_WARNING_RATE}
                stroke={`${colors.complained}A0`}
                label={{
                  value: "",
                  position: "insideBottomLeft",
                  fill: colors.complained,
                  fontSize: 12,
                }}
                strokeDasharray="3 3"
              />

              {/* <CartesianGrid vertical={false} strokeDasharray="3 3" /> */}
              {/* <YAxis fontSize={12} /> */}

              {/* <ReferenceLine
                y={0}
                stroke={colors.xaxis}
                strokeDasharray="3 3"
              /> */}

              <ReferenceLine
                y={HARD_BOUNCE_RISK_RATE}
                stroke={`${colors.bounced}A0`}
                label={{
                  value: ``,
                  position: "insideBottomLeft",
                  fill: colors.bounced,
                  fontSize: 12,
                }}
                strokeDasharray="3 3"
              />
              <RechartsTooltip
                content={({ payload }) => {
                  const data = payload?.[0]?.payload as {
                    name: string;
                    value: number;
                  };

                  if (!data) return null;

                  return (
                    <div className="bg-background border shadow-lg p-2 rounded-xl flex flex-col gap-2 px-4">
                      <p className="text-sm text-muted-foreground">
                        {data.name}
                      </p>
                      <div className="flex gap-2 items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-[2px]"
                          style={{ background: colors.clicked }}
                        ></div>
                        <p className="text-xs text-muted-foreground w-[70px]">
                          Current
                        </p>
                        <p className="text-xs font-mono">
                          {data.value.toFixed(2)}%
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-[2px]"
                          style={{ background: colors.complained }}
                        ></div>
                        <p className="text-xs text-muted-foreground w-[70px]">
                          Warning at
                        </p>
                        <p className="text-xs font-mono">
                          {HARD_BOUNCE_WARNING_RATE}%
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-[2px]"
                          style={{ background: colors.bounced }}
                        ></div>
                        <p className="text-xs text-muted-foreground w-[70px]">
                          Risk at
                        </p>
                        <p className="text-xs font-mono">
                          {HARD_BOUNCE_RISK_RATE}%
                        </p>
                      </div>
                    </div>
                  );
                }}
                cursor={false}
              />
              <Bar
                barSize={150}
                dataKey="value"
                stackId="a"
                fill={colors.clicked}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="w-1/2 border rounded-xl shadow p-4">
          <div className=" flex items-center gap-2">
            <div className=" text-muted-foreground font-mono">
              Complaint Rate
            </div>
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className=" h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="w-[300px]">
                The percentage of emails sent from your account that resulted in
                recipients reporting them as spam.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-baseline gap-4">
            <div className="text-2xl mt-2 font-mono">
              {metrics?.complaintRate.toFixed(2)}%
            </div>
            <StatusBadge status={complaintStatus} />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={complaintMetric}
              margin={{
                top: 20,
                left: -30,
                bottom: 5,
              }}
            >
              <YAxis
                domain={[0, 0.8]}
                ticks={[0, 0.2, 0.4, 0.6, 0.8]}
                fontSize={12}
                tickFormatter={(value) => `${value}%`}
                hide={false}
                axisLine={false}
                interval={0}
              />
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke={`${colors.xaxis}50`}
              />

              <ReferenceLine
                y={COMPLAINED_WARNING_RATE}
                stroke={`${colors.complained}A0`}
                label={{
                  value: "",
                  position: "insideBottomLeft",
                  fill: colors.complained,
                  fontSize: 12,
                }}
                strokeDasharray="3 3"
              />

              {/* <ReferenceLine
                y={0}
                stroke={colors.xaxis}
                strokeDasharray="3 3"
              /> */}

              <ReferenceLine
                y={COMPLAINED_RISK_RATE}
                stroke={`${colors.bounced}A0`}
                label={{
                  value: ``,
                  position: "insideBottomLeft",
                  fill: colors.bounced,
                  fontSize: 12,
                }}
                strokeDasharray="3 3"
              />
              <RechartsTooltip
                content={({ payload }) => {
                  const data = payload?.[0]?.payload as {
                    name: string;
                    value: number;
                  };

                  if (!data) return null;

                  return (
                    <div className="bg-background border shadow-lg p-2 rounded-xl flex flex-col gap-2 px-4">
                      <p className="text-sm text-muted-foreground">
                        {data.name}
                      </p>
                      <div className="flex gap-2 items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-[2px]"
                          style={{ background: colors.clicked }}
                        ></div>
                        <p className="text-xs text-muted-foreground w-[70px]">
                          Current
                        </p>
                        <p className="text-xs font-mono">
                          {data.value.toFixed(2)}%
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-[2px]"
                          style={{ background: colors.complained }}
                        ></div>
                        <p className="text-xs text-muted-foreground w-[70px]">
                          Warning at
                        </p>
                        <p className="text-xs font-mono">
                          {COMPLAINED_WARNING_RATE}%
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-[2px]"
                          style={{ background: colors.bounced }}
                        ></div>
                        <p className="text-xs text-muted-foreground w-[70px]">
                          Risk at
                        </p>
                        <p className="text-xs font-mono">
                          {COMPLAINED_RISK_RATE}%
                        </p>
                      </div>
                    </div>
                  );
                }}
                cursor={false}
              />
              <Bar
                barSize={150}
                dataKey="value"
                stackId="a"
                fill={colors.clicked}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </TooltipProvider>
  );
}

export const StatusBadge: React.FC<{ status: ACCOUNT_STATUS }> = ({
  status,
}) => {
  const className =
    status === "HEALTHY"
      ? " text-success border-success"
      : status === "WARNING"
        ? " text-warning border-warning"
        : " text-destructive border-destructive";

  const StatusIcon =
    status === "HEALTHY"
      ? CheckCircle2Icon
      : status === "WARNING"
        ? TriangleAlertIcon
        : OctagonAlertIcon;

  return (
    <div
      className={` capitalize text-xs ${className} flex gap-1 items-center   rounded-lg`}
    >
      <StatusIcon className="h-3.5 w-3.5" />
      {status.toLowerCase()}
    </div>
  );
};
