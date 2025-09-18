"use client";

import React from "react";

import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import LoginPage from "~/app/login/login-page";
import { FullScreenLoading } from "~/components/FullScreenLoading";
import { Rocket } from "lucide-react";
import { WaitListForm } from "~/app/wait-list/waitlist-form";

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
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-xl flex-col gap-6 rounded-2xl border bg-card p-8 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/10 p-2 text-primary">
              <Rocket className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold">You're on the waitlist</h1>
              <p className="text-sm text-muted-foreground">
                Share a bit more context so we can prioritize your access.
              </p>
            </div>
          </div>

          <WaitListForm userEmail={session.user.email ?? ""} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
