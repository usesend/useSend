"use client";

import { Badge } from "@usesend/ui/src/badge";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { formatDistanceToNow } from "date-fns";

import { api } from "~/trpc/react";

const VERDICT: Record<
  string,
  { label: string; variant: "outline" | "secondary" | "destructive" }
> = {
  approve: { label: "Guard: let in", variant: "outline" },
  unsure: { label: "Guard: unsure", variant: "secondary" },
  reject: { label: "Guard: reject", variant: "destructive" },
};

/** Pending applications with the Guard's advice, and a button for each decision. */
export function PendingApplications() {
  const utils = api.useUtils();
  const pending = api.admin.pendingApplications.useQuery();

  const letIn = api.admin.updateUserWaitlist.useMutation({
    onSuccess: (user) => {
      toast.success(`Let in ${user.email}. They got the welcome email.`);
      void utils.admin.pendingApplications.invalidate();
    },
    onError: (error) => toast.error(error.message ?? "Couldn't let them in"),
  });

  const reject = api.admin.rejectWaitlistUser.useMutation({
    onSuccess: () => {
      toast.success("Rejected. They got the rejection email.");
      void utils.admin.pendingApplications.invalidate();
    },
    onError: (error) => toast.error(error.message ?? "Couldn't reject"),
  });

  const busyUserId = letIn.isPending
    ? letIn.variables?.userId
    : reject.isPending
      ? reject.variables?.userId
      : undefined;

  if (pending.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Loading applications...
      </div>
    );
  }

  const applications = pending.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Pending applications</h2>
        <p className="text-sm text-muted-foreground">
          {applications.length} waiting
        </p>
      </div>

      {applications.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Nobody is waiting.
        </div>
      ) : null}

      {applications.map((application) => {
        const verdict = application.guardVerdict
          ? VERDICT[application.guardVerdict]
          : undefined;
        const busy = busyUserId === application.userId;

        return (
          <div
            key={application.id}
            className="space-y-3 rounded-lg border p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="break-all font-medium">{application.email}</p>
                <a
                  href={application.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-sm text-muted-foreground underline"
                >
                  {application.website}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={verdict?.variant ?? "outline"}>
                  {verdict?.label ?? "Not checked yet"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(application.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>

            {application.guardNote ? (
              <p className="whitespace-pre-wrap text-sm">
                {application.guardNote}
              </p>
            ) : null}

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                What they told us
              </summary>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Email types</dt>
                  <dd className="capitalize">
                    {application.emailTypes.join(", ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Volume</dt>
                  <dd className="whitespace-pre-wrap">
                    {application.emailVolume}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">
                    How people join their list
                  </dt>
                  <dd className="whitespace-pre-wrap">
                    {application.listSource}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">What they'll send</dt>
                  <dd className="whitespace-pre-wrap">
                    {application.description}
                  </dd>
                </div>
              </dl>
            </details>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busyUserId !== undefined}
                onClick={() => reject.mutate({ userId: application.userId })}
              >
                {busy && reject.isPending ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : null}
                Reject
              </Button>
              <Button
                type="button"
                disabled={busyUserId !== undefined}
                onClick={() =>
                  letIn.mutate({
                    userId: application.userId,
                    isWaitlisted: false,
                  })
                }
              >
                {busy && letIn.isPending ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : null}
                Let in
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
