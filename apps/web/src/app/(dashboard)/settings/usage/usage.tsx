"use client";

import { api } from "~/trpc/react";
import { Card } from "@usesend/ui/src/card";
import Spinner from "@usesend/ui/src/spinner";
import { format } from "date-fns";
import {
  getCost,
  PLAN_CREDIT_UNITS,
  UNIT_PRICE,
  USAGE_UNIT_PRICE,
} from "~/lib/usage";
import { useTeam } from "~/providers/team-context";
import { EmailUsageType } from "@prisma/client";
import { PlanDetails } from "~/components/payments/PlanDetails";
import { UpgradeButton } from "~/components/payments/UpgradeButton";
import { Progress } from "@usesend/ui/src/progress";

const FREE_PLAN_LIMIT = 3000;

function FreePlanUsage({
  usage,
  dayUsage,
}: {
  usage: { type: EmailUsageType; sent: number }[];
  dayUsage: { type: EmailUsageType; sent: number }[];
}) {
  const DAILY_LIMIT = 100;
  const totalSent = usage?.reduce((acc, item) => acc + item.sent, 0) || 0;
  const monthlyPercentageUsed = (totalSent / FREE_PLAN_LIMIT) * 100;

  // Calculate daily usage - this is a simplified version, you might want to adjust based on actual daily tracking
  const dailyUsage = dayUsage?.reduce((acc, item) => acc + item.sent, 0) || 0;
  const dailyPercentageUsed = (dailyUsage / DAILY_LIMIT) * 100;

  return (
    <Card className="p-6">
      <div className="flex w-full">
        <div className="space-y-4 w-full">
          {usage?.map((item) => (
            <div
              key={item.type}
              className="flex justify-between items-center border-b pb-3 last:border-0 last:pb-0"
            >
              <div>
                <div className="font-medium capitalize">
                  {item.type.toLowerCase()}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {item.type === "TRANSACTIONAL"
                    ? "Mails sent using the send api or SMTP"
                    : "Mails designed sent from useSend editor"}
                </div>
              </div>
              <div className="font-mono font-medium">
                {item.sent.toLocaleString()} emails
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center pt-3 ">
            <div className="font-medium">Total</div>
            <div className="font-mono font-medium">
              {usage
                ?.reduce((acc, item) => acc + item.sent, 0)
                .toLocaleString()}{" "}
              emails
            </div>
          </div>
        </div>
        <div className="w-full flex justify-center items-center">
          <div className="w-[300px] space-y-8">
            <div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="">Monthly Limit</div>
                  <div className="font-mono font-medium">
                    {totalSent.toLocaleString()}/
                    {FREE_PLAN_LIMIT.toLocaleString()}
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-in-out"
                    style={{
                      width: `${Math.min(monthlyPercentageUsed, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="">Daily Limit</div>
                  <div className="font-mono">
                    {dailyUsage.toLocaleString()}/{DAILY_LIMIT.toLocaleString()}
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-in-out"
                    style={{ width: `${Math.min(dailyPercentageUsed, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PaidPlanUsage({
  usage,
}: {
  usage: { type: EmailUsageType; sent: number }[];
}) {
  const { currentTeam } = useTeam();

  if (currentTeam?.plan === "FREE") return null;

  const totalCost =
    usage?.reduce((acc, item) => acc + getCost(item.sent, item.type), 0) || 0;
  const planCreditCost = PLAN_CREDIT_UNITS[currentTeam?.plan!] * UNIT_PRICE;

  return (
    <Card className="p-6">
      <div className="flex w-full">
        <div className="space-y-4 w-full">
          {usage?.map((item) => (
            <div
              key={item.type}
              className="flex justify-between items-center border-b pb-3 last:border-0 last:pb-0"
            >
              <div>
                <div className="font-medium capitalize">
                  {item.type.toLowerCase()}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  <span className="font-mono">
                    {item.sent.toLocaleString()}
                  </span>{" "}
                  emails at{" "}
                  <span className="font-mono">
                    ${USAGE_UNIT_PRICE[item.type]}
                  </span>{" "}
                  each
                </div>
              </div>
              <div className="font-mono font-medium">
                ${getCost(item.sent, item.type).toFixed(2)}
              </div>
            </div>
          ))}
          <div>
            <div className="flex justify-between items-center border-b pb-3 last:border-0 last:pb-0">
              <div>
                <div className="font-medium capitalize">Available credit</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {currentTeam?.plan}
                </div>
              </div>
              <div className="font-mono font-medium">
                {totalCost > planCreditCost
                  ? "0"
                  : `$${(planCreditCost - totalCost).toFixed(2)}`}
              </div>
            </div>
            <Progress
              value={100 - Math.min(100, (totalCost / planCreditCost) * 100)}
            />
          </div>
        </div>
        <div className="w-full flex justify-center items-center">
          <div>
            <div className="font-medium">Amount Due</div>
            <div className="">
              <div className="text-2xl font-mono">
                {planCreditCost < totalCost
                  ? `$${(totalCost - planCreditCost).toFixed(2)}`
                  : `$${(0.0).toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function UsagePage() {
  const { data: usage, isLoading } = api.billing.getThisMonthUsage.useQuery();
  const { currentTeam } = useTeam();

  const { data: subscription } = api.billing.getSubscriptionDetails.useQuery();

  // Calculate the billing period based on subscription if available
  const today = new Date();
  const billingPeriod =
    subscription?.currentPeriodStart && subscription?.currentPeriodEnd
      ? `${format(new Date(subscription.currentPeriodStart), "MMM dd")} - ${format(new Date(subscription.currentPeriodEnd), "MMM dd")}`
      : `${format(new Date(today.getFullYear(), today.getMonth(), 1), "MMM dd")} - ${format(new Date(today.getFullYear(), today.getMonth() + 1, 1), "MMM dd")}`;

  return (
    <div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Usage</h1>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">{billingPeriod}</span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="w-8 h-8" innerSvgClass="stroke-primary" />
          </div>
        ) : usage?.month.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            No usage data available
          </Card>
        ) : currentTeam?.plan === "FREE" ? (
          <FreePlanUsage
            usage={usage?.month ?? []}
            dayUsage={usage?.day ?? []}
          />
        ) : (
          <PaidPlanUsage usage={usage?.month ?? []} />
        )}
      </div>
      {currentTeam?.plan ? (
        <Card className=" rounded-xl mt-10 p-4 px-8">
          <PlanDetails />
          <div className="mt-4">
            {currentTeam?.plan === "FREE" ? <UpgradeButton /> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
