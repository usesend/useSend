"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { api } from "~/trpc/react";

// Define the Team type based on the Prisma schema
type Team = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  plan: "FREE" | "BASIC";
  isActive: boolean;
  isBlocked: boolean;
  freePlanAllowed: boolean;
  stripeCustomerId?: string | null;
  billingEmail?: string | null;
};

interface TeamContextType {
  currentTeam: Team | null;
  teams: Team[];
  isLoading: boolean;
  currentRole: "ADMIN" | "MEMBER";
  currentIsAdmin: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { data: teams, status } = api.team.getTeams.useQuery();

  const currentTeam = teams?.[0] ?? null;

  const value = {
    currentTeam,
    teams: teams || [],
    isLoading: status === "pending",
    currentRole: currentTeam?.teamUsers[0]?.role ?? "MEMBER",
    currentIsAdmin: currentTeam?.teamUsers[0]?.role === "ADMIN",
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error("useTeam must be used within a TeamProvider");
  }
  return context;
}
