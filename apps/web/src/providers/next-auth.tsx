"use client";

import React, { useEffect } from "react";

import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import LoginPage from "~/app/login/login-page";
import { FullScreenLoading } from "~/components/FullScreenLoading";
import { useRouter } from "next/navigation";

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

  if (session.user.isWaitlisted) {
    // The waitlist page shows their saved application, if any.
    return <RedirectToWaitlist />;
  }

  return <>{children}</>;
};

const RedirectToWaitlist = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/wait-list");
  }, [router]);
  return <FullScreenLoading />;
};
