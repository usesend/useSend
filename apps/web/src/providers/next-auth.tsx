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

  if (session.user.isWaitlisted) {
    return (
      <div className="flex items-center justify-center min-h-screen ">
        <div className="p-8 shadow-lg rounded-lg flex flex-col gap-4">
          <Rocket />
          <h1 className="text-2xl font-bold">You're on the Waitlist!</h1>
          <p className=" text-secondary-muted">
            Hang tight, we'll get to you as soon as possible.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
