"use client";

import { useSession } from "next-auth/react";
import { FullScreenLoading } from "~/components/FullScreenLoading";
import { AddSesSettings } from "~/components/settings/AddSesSettings";
import CreateTeam from "~/components/team/CreateTeam";
import { api } from "~/trpc/react";
import { TeamProvider } from "./team-context";

export const DashboardProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data: session } = useSession();
  const { data: teams, status } = api.team.getTeams.useQuery();
  const { data: settings, status: settingsStatus } =
    api.admin.getSesSettings.useQuery(undefined, {
      enabled: session?.user.isAdmin === true,
    });

  if (
    status === "pending" ||
    (settingsStatus === "pending" && session?.user.isAdmin)
  ) {
    return <FullScreenLoading />;
  }

  if (settings?.length === 0 && session?.user.isAdmin) {
    return <AddSesSettings />;
  }

  if (!teams || teams.length === 0) {
    return <CreateTeam />;
  }

  return <TeamProvider>{children}</TeamProvider>;
};
