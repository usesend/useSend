import React from "react";
import {
  BarChart,
  Bar,
  Rectangle,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { EmailStatusIcon } from "../emails/email-status-badge";
import { EmailStatus } from "@prisma/client";
import { api } from "~/trpc/react";
import Spinner from "@usesend/ui/src/spinner";
import { useTheme } from "@usesend/ui";
import { useColors } from "./hooks/useColors";

interface EmailChartProps {
  days: number;
  domain: string | null;
}

const STACK_ORDER: string[] = [
  "delivered",
  "bounced",
  "complained",
  "opened",
  "clicked",
] as const;

type StackKey = (typeof STACK_ORDER)[number];

function createRoundedTopShape(currentKey: StackKey) {
  const currentIndex = STACK_ORDER.indexOf(currentKey);
  return (props: any) => {
    const payload = props.payload as
      | Partial<Record<StackKey, number>>
      | undefined;
    let hasAbove = false;
    for (let i = currentIndex + 1; i < STACK_ORDER.length; i++) {
      const key = STACK_ORDER[i];
      const val = key ? (payload?.[key] ?? 0) : 0;
      if (val > 0) {
        hasAbove = true;
        break;
      }
    }

    const radius = hasAbove ? [0, 0, 0, 0] : [2.5, 2.5, 0, 0];
    return <Rectangle {...props} radius={radius as any} />;
  };
}

export default function EmailChart({ days, domain }: EmailChartProps) {
  const domainId = domain ? Number(domain) : undefined;
  const statusQuery = api.dashboard.emailTimeSeries.useQuery({
    days: days,
    domain: domainId,
  });

  const currentColors = useColors();

  return (
    <div className="flex flex-col gap-16">
      {!statusQuery.isLoading && statusQuery.data ? (
        <div className="w-full h-[450px] border shadow rounded-xl p-4">
          <div>
            {/* <div className="mb-4 text-sm">Emails</div> */}

            <div className="flex gap-10">
              <EmailChartItem
                status={"total"}
                count={statusQuery.data.totalCounts.sent}
                percentage={100}
              />
              <EmailChartItem
                status={EmailStatus.DELIVERED}
                count={statusQuery.data.totalCounts.delivered}
                percentage={
                  statusQuery.data.totalCounts.delivered /
                  statusQuery.data.totalCounts.sent
                }
              />
              <EmailChartItem
                status={EmailStatus.BOUNCED}
                count={statusQuery.data.totalCounts.bounced}
                percentage={
                  statusQuery.data.totalCounts.bounced /
                  statusQuery.data.totalCounts.sent
                }
              />
              <EmailChartItem
                status={EmailStatus.COMPLAINED}
                count={statusQuery.data.totalCounts.complained}
                percentage={
                  statusQuery.data.totalCounts.complained /
                  statusQuery.data.totalCounts.sent
                }
              />
              <EmailChartItem
                status={EmailStatus.CLICKED}
                count={statusQuery.data.totalCounts.clicked}
                percentage={
                  statusQuery.data.totalCounts.clicked /
                  statusQuery.data.totalCounts.sent
                }
              />
              <EmailChartItem
                status={EmailStatus.OPENED}
                count={statusQuery.data.totalCounts.opened}
                percentage={
                  statusQuery.data.totalCounts.opened /
                  statusQuery.data.totalCounts.sent
                }
              />
            </div>
          </div>
          <ResponsiveContainer width="100%" height="80%">
            <BarChart
              width={900}
              height={200}
              data={statusQuery.data.result}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <XAxis
                dataKey="date"
                fontSize={12}
                className="font-mono"
                stroke={currentColors.xaxis}
              />
              {/* <YAxis fontSize={12} className="font-mono" /> */}
              <Tooltip
                content={({ payload }) => {
                  const data = payload?.[0]?.payload as Record<
                    | "sent"
                    | "delivered"
                    | "opened"
                    | "clicked"
                    | "bounced"
                    | "complained",
                    number
                  > & { date: string };

                  if (!data || data.sent === 0) return null;

                  return (
                    <div className=" bg-background border shadow-lg p-2 rounded-xl flex flex-col gap-2 px-4">
                      <p className="text-sm text-muted-foreground">
                        {data.date}
                      </p>
                      {data.delivered ? (
                        <div className="flex gap-2 items-center">
                          <div
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{ backgroundColor: currentColors.delivered }}
                          ></div>
                          <p className="text-xs text-muted-foreground w-[70px]">
                            Delivered
                          </p>
                          <p className="text-xs font-mono">{data.delivered}</p>
                        </div>
                      ) : null}
                      {data.bounced ? (
                        <div className="flex gap-2 items-center">
                          <div
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{ backgroundColor: currentColors.bounced }}
                          ></div>
                          <p className="text-xs text-muted-foreground w-[70px]">
                            Bounced
                          </p>
                          <p className="text-xs font-mono">{data.bounced}</p>
                        </div>
                      ) : null}
                      {data.complained ? (
                        <div className="flex gap-2 items-center">
                          <div
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{
                              backgroundColor: currentColors.complained,
                            }}
                          ></div>
                          <p className="text-xs text-muted-foreground w-[70px]">
                            Complained
                          </p>
                          <p className="text-xs font-mono">{data.complained}</p>
                        </div>
                      ) : null}
                      {data.opened ? (
                        <div className="flex gap-2 items-center">
                          <div
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{ backgroundColor: currentColors.opened }}
                          ></div>
                          <p className="text-xs text-muted-foreground w-[70px]">
                            Opened
                          </p>
                          <p className="text-xs font-mono">{data.opened}</p>
                        </div>
                      ) : null}
                      {data.clicked ? (
                        <div className="flex gap-2 items-center">
                          <div
                            className="w-2.5 h-2.5 rounded-[2px]"
                            style={{ backgroundColor: currentColors.clicked }}
                          ></div>
                          <p className="text-xs text-muted-foreground w-[70px]">
                            Clicked
                          </p>
                          <p className="text-xs font-mono">{data.clicked}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                }}
                cursor={false}
              />
              {/* <Legend /> */}
              <Bar
                barSize={8}
                dataKey="delivered"
                stackId="a"
                fill={currentColors.delivered}
                shape={createRoundedTopShape("delivered")}
              />
              <Bar
                dataKey="bounced"
                stackId="a"
                fill={currentColors.bounced}
                shape={createRoundedTopShape("bounced")}
              />
              <Bar
                dataKey="complained"
                stackId="a"
                fill={currentColors.complained}
                shape={createRoundedTopShape("complained")}
              />
              <Bar
                dataKey="opened"
                stackId="a"
                fill={currentColors.opened}
                shape={createRoundedTopShape("opened")}
              />
              <Bar
                dataKey="clicked"
                stackId="a"
                fill={currentColors.clicked}
                shape={createRoundedTopShape("clicked")}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[450px]"> </div>
      )}
    </div>
  );
}

type DashboardItemCardProps = {
  status: EmailStatus | "total";
  count: number;
  percentage: number;
};

const DashboardItemCard: React.FC<DashboardItemCardProps> = ({
  status,
  count,
  percentage,
}) => {
  return (
    <div className="h-[100px] w-[16%] min-w-[170px]  bg-secondary/10 border shadow rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {status !== "total" ? <EmailStatusIcon status={status} /> : null}
        <div className=" capitalize">{status.toLowerCase()}</div>
      </div>
      <div className="flex justify-between items-end">
        <div className="text-foreground font-light text-2xl  font-mono">
          {count}
        </div>
        {status !== "total" ? (
          <div className="text-sm pb-1">
            {count > 0 ? (percentage * 100).toFixed(0) : 0}%
          </div>
        ) : null}
      </div>
    </div>
  );
};

const EmailChartItem: React.FC<DashboardItemCardProps> = ({
  status,
  count,
  percentage,
}) => {
  const currentColors = useColors();

  const getColorForStatus = (status: EmailStatus | "total"): string => {
    switch (status) {
      case "DELIVERED":
        return currentColors.delivered;
      case "BOUNCED":
        return currentColors.bounced;
      case "COMPLAINED":
        return currentColors.complained;
      case "OPENED":
        return currentColors.opened;
      case "CLICKED":
        return currentColors.clicked;
      case "total":
      default:
        return "#6b7280"; // gray-500 for total and other statuses
    }
  };

  return (
    <div className="flex gap-3 items-stretch font-mono">
      <div>
        <div className=" flex  items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-[3px]"
            style={{ backgroundColor: getColorForStatus(status) }}
          ></div>

          <div className="text-xs uppercase text-muted-foreground ">
            {status.toLowerCase()}
          </div>
        </div>
        <div className="mt-1 -ml-0.5 ">
          <span className="text-xl font-mono">{count}</span>
          <span className="text-xs ml-2 font-mono">
            {status !== "total"
              ? `(${count > 0 ? (percentage * 100).toFixed(0) : 0}%)`
              : null}
          </span>
        </div>
      </div>
    </div>
  );
};
