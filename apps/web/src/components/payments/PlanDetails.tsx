import { Plan } from "@prisma/client";
import { PLAN_PERKS } from "~/lib/constants/payments";
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

  return (
    <div>
      <div className="capitalize text-lg">
        {subscriptionQuery.data?.status === "active"
          ? planKey.toLowerCase()
          : "free"}
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
