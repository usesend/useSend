"use client";

import { PAY_AS_YOU_GO } from "~/lib/constants/payments";
import { UpgradeButton } from "~/components/payments/UpgradeButton";
import { useTeam } from "~/providers/team-context";
import { isCloud } from "~/utils/common";

/** Tells the team, at the top of every page, when its emails can't go out. */
export function SendingStatusBanner() {
  const { currentTeam } = useTeam();

  if (!isCloud() || !currentTeam) return null;

  if (currentTeam.isBlocked) {
    return (
      <div className="mb-6 rounded-lg border border-red/40 bg-red/10 px-4 py-3 text-sm">
        <p className="font-medium">Sending is blocked for this team.</p>
        <p className="mt-1 text-muted-foreground">
          Emails won&apos;t go out until we&apos;ve reviewed the account with
          you. Reach us at hey@usesend.com.
        </p>
      </div>
    );
  }

  const onFreePlan = currentTeam.plan === "FREE" || !currentTeam.isActive;
  if (onFreePlan && !currentTeam.freePlanAllowed) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Start sending for {PAY_AS_YOU_GO.price}</p>
          <p className="mt-1 text-muted-foreground">
            {PAY_AS_YOU_GO.includes}, then you only pay for what you send. Until
            then, you can send test emails to yourself.
          </p>
        </div>
        <UpgradeButton className="mt-0 shrink-0" />
      </div>
    );
  }

  return null;
}
