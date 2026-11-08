import { Plan } from "@prisma/client";
import { PLAN_PERKS } from "~/lib/constants/payments";
import { isEntitledSubscriptionStatus } from "~/lib/subscription-status";
import { CheckCircle2 } from "lucide-react";
import { api } from "~/trpc/react";
import Spinner from "@usesend/ui/src/spinner";
import { useTeam } from "~/providers/team-context";
import { Badge } from "@usesend/ui/src/badge";
import { format } from "date-fns";

export const PlanDetails = () => {
  const subscriptionQuery = api.billing.getSubscriptionDetails.useQuery();
  const { currentTeam } = useTeam();

  if (subscriptionQuery.isLoading || !currentTeam) {
    return null;
  }

  const planKey = currentTeam.plan as keyof typeof PLAN_PERKS;
  const perks = PLAN_PERKS[planKey] || [];
  const isEntitled = isEntitledSubscriptionStatus(
    subscriptionQuery.data?.status,
  );

  // New teams can't send on the free plan, so don't show it as their plan.
  if (!isEntitled && currentTeam.freePlanAllowed === false) {
    return (
      <div>
        <div className="text-lg">No plan yet</div>
        <div className="text-muted-foreground text-sm">
          Upgrade to Basic to start sending. Basic includes:
        </div>
        <ul className="mt-4 space-y-3">
          {PLAN_PERKS.BASIC.map((perk, index) => (
            <li key={index} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green flex-shrink-0" />
              <span className="text-sm">{perk}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <div className="capitalize text-lg">
        {isEntitled ? planKey.toLowerCase() : "free"}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground text-sm">Current plan</div>
        {subscriptionQuery.data?.cancelAtPeriodEnd && (
          <Badge variant="secondary">
            Cancels {format(subscriptionQuery.data.cancelAtPeriodEnd, "MMM dd")}
          </Badge>
        )}
      </div>
      <ul className="mt-4 space-y-3">
        {perks.map((perk, index) => (
          <li key={index} className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green flex-shrink-0" />
            <span className="text-sm">{perk}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
