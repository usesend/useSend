"use client";

import React from "react";
import { Rocket } from "lucide-react";
import { redirect } from "next/navigation";

import { WaitListForm } from "~/app/wait-list/waitlist-form";
import { FullScreenLoading } from "~/components/FullScreenLoading";
import { authClient } from "~/lib/auth-client";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <FullScreenLoading />;
  }

  if (!session) {
    redirect("/login");
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

          <WaitListForm userEmail={session.user.email} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
