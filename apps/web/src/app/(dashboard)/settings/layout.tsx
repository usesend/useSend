"use client";

import { useTeam } from "~/providers/team-context";
import { SettingsNavButton } from "../dev-settings/settings-nav-button";
import { isCloud } from "~/utils/common";

export const dynamic = "force-static";

export default function ApiKeysPage({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentIsAdmin } = useTeam();

  return (
    <div>
      <h1 className="font-bold text-lg">Settings</h1>
      <div className="flex gap-4 mt-4">
        {isCloud() ? (
          <SettingsNavButton href="/settings">Usage</SettingsNavButton>
        ) : null}
        {currentIsAdmin && isCloud() ? (
          <SettingsNavButton href="/settings/billing">
            Billing
          </SettingsNavButton>
        ) : null}
        <SettingsNavButton href="/settings/team">Team</SettingsNavButton>
        <SettingsNavButton href="/settings/account">Account</SettingsNavButton>
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
