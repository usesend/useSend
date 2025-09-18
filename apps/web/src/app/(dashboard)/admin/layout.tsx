"use client";

import { SettingsNavButton } from "../dev-settings/settings-nav-button";
import { isCloud } from "~/utils/common";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-lg font-bold">Admin</h1>
      <div className="mt-4 flex gap-4">
        <SettingsNavButton href="/admin">
          SES Configurations
        </SettingsNavButton>
        <SettingsNavButton href="/admin/teams">
          Teams
        </SettingsNavButton>
        {isCloud() ? (
          <SettingsNavButton href="/admin/waitlist">
            Waitlist
          </SettingsNavButton>
        ) : null}
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
