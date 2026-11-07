"use client";

import Link from "next/link";
import { Button } from "@usesend/ui/src/button";
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

  if (currentTeam.sendingPausedAt) {
    return (
      <div className="mb-6 rounded-lg border border-red/40 bg-red/10 px-4 py-3 text-sm">
        <p className="font-medium">Sending is paused for this team.</p>
        <p className="mt-1 text-muted-foreground">
          Too many emails bounced or were marked as spam. Remove old or
          unconfirmed addresses from your list, then reply to our email or write
          to hey@usesend.com and we&apos;ll turn sending back on.
        </p>
      </div>
    );
  }

  const onFreePlan = currentTeam.plan === "FREE" || !currentTeam.isActive;
  if (onFreePlan && !currentTeam.freePlanAllowed) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Pick a plan to start sending.</p>
          <p className="mt-1 text-muted-foreground">
            You can set up domains and API keys now. Emails go out once
            you&apos;re on a plan.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/billing">Choose a plan</Link>
        </Button>
      </div>
    );
  }

  return null;
}
