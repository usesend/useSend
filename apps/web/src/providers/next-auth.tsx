"use client";

import React from "react";

import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import LoginPage from "~/app/login/login-page";
import { Rocket } from "lucide-react";
import { FullScreenLoading } from "~/components/FullScreenLoading";

export type NextAuthProviderProps = {
  session?: Session | null | undefined;
  children: React.ReactNode;
};

export const NextAuthProvider = ({
  session,
  children,
}: NextAuthProviderProps) => {
  return (
    <SessionProvider session={session}>
      <AppAuthProvider>{children}</AppAuthProvider>
    </SessionProvider>
  );
};

const AppAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession({ required: true });

  if (status === "loading") {
    return <FullScreenLoading />;
  }

  if (!session) {
    return <LoginPage />;
  }

  return <>{children}</>;
};
