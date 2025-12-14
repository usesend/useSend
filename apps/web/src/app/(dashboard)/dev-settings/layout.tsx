"use client";

import { H1 } from "@usesend/ui";
import { SettingsNavButton } from "./settings-nav-button";

export const dynamic = "force-static";

export default function ApiKeysPage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <H1>Developer Settings</H1>
      <div className="flex gap-4 mt-4">
        <SettingsNavButton href="/dev-settings">API Keys</SettingsNavButton>
        <SettingsNavButton href="/dev-settings/smtp">SMTP</SettingsNavButton>
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
