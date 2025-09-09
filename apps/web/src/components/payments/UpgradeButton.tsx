import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";

export const UpgradeButton = () => {
  const checkoutMutation = api.billing.createCheckoutSession.useMutation();

  const onClick = async () => {
    const url = await checkoutMutation.mutateAsync();
    if (url) {
      window.location.href = url;
    }
  };

  return (
    <Button
      onClick={onClick}
      className="mt-4 w-[120px]"
      disabled={checkoutMutation.isPending}
    >
      {checkoutMutation.isPending ? <Spinner className="w-4 h-4" /> : "Upgrade"}
    </Button>
  );
};
