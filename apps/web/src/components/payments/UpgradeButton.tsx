import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { cn } from "@usesend/ui/lib/utils";
import { PAY_AS_YOU_GO } from "~/lib/constants/payments";
import { useTeam } from "~/providers/team-context";
import { api } from "~/trpc/react";

export const UpgradeButton = ({ className }: { className?: string }) => {
  const checkoutMutation = api.billing.createCheckoutSession.useMutation();
  const { currentTeam } = useTeam();
  // New teams have nothing to upgrade from: they start paying to send.
  const label =
    currentTeam?.freePlanAllowed === false ? PAY_AS_YOU_GO.cta : "Upgrade";

  const onClick = async () => {
    const url = await checkoutMutation.mutateAsync();
    if (url) {
      window.location.href = url;
    }
  };

  return (
    <Button
      onClick={onClick}
      className={cn("mt-4 min-w-[120px]", className)}
      disabled={checkoutMutation.isPending}
    >
      {checkoutMutation.isPending ? <Spinner className="w-4 h-4" /> : label}
    </Button>
  );
};
