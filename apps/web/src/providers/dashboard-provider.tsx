"use client";

import { FullScreenLoading } from "~/components/FullScreenLoading";
import { AddSesSettings } from "~/components/settings/AddSesSettings";
import CreateTeam from "~/components/team/CreateTeam";
import { env } from "~/env";
import { api } from "~/trpc/react";
import { TeamProvider } from "./team-context";
import { authClient } from "~/lib/auth-client";

export const DashboardProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data: session } = authClient.useSession();
  const { data: teams, status } = api.team.getTeams.useQuery();
  const { data: settings, status: settingsStatus } =
    api.admin.getSesSettings.useQuery(undefined, {
      enabled: !env.NEXT_PUBLIC_IS_CLOUD || session?.user.isAdmin,
    });

  if (
    status === "pending" ||
    (settingsStatus === "pending" && !env.NEXT_PUBLIC_IS_CLOUD)
  ) {
    return <FullScreenLoading />;
  }

  if (
    settings?.length === 0 &&
    (!env.NEXT_PUBLIC_IS_CLOUD || session?.user.isAdmin)
  ) {
    return <AddSesSettings />;
  }

  if (!teams || teams.length === 0) {
    return <CreateTeam />;
  }

  return <TeamProvider>{children}</TeamProvider>;
};
