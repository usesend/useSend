"use client";

import { Badge } from "@usesend/ui/src/badge";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

import { api } from "~/trpc/react";

const VERDICT: Record<
  string,
  { label: string; variant: "outline" | "secondary" | "destructive" }
> = {
  approve: { label: "Guard: let in", variant: "outline" },
  unsure: { label: "Guard: unsure", variant: "secondary" },
  reject: { label: "Guard: reject", variant: "destructive" },
};

type Filter = "approve" | "unsure" | "reject" | "none";

const FILTERS: Array<[Filter, string]> = [
  ["approve", "Guard says let in"],
  ["unsure", "Unsure"],
  ["reject", "Guard says reject"],
  ["none", "Not checked yet"],
];

/** Pending applications with the Guard's advice, and a button for each decision. */
export function PendingApplications({
  onDecided,
}: {
  /** Called after a Let in or Reject goes through. */
  onDecided?: (userId: number) => void;
}) {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<Filter>("approve");
  const pending = api.admin.pendingApplications.useQuery({ verdict: filter });

  const letIn = api.admin.updateUserWaitlist.useMutation({
    onSuccess: (user) => {
      toast.success(`Let in ${user.email}.`);
      onDecided?.(user.id);
      return utils.admin.pendingApplications.invalidate();
    },
    onError: (error) => {
      toast.error(error.message ?? "Couldn't let them in");
      return utils.admin.pendingApplications.invalidate();
    },
  });

  const reject = api.admin.rejectWaitlistUser.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("Rejected. They got the rejection email.");
      onDecided?.(variables.userId);
      return utils.admin.pendingApplications.invalidate();
    },
    onError: (error) => {
      toast.error(error.message ?? "Couldn't reject");
      return utils.admin.pendingApplications.invalidate();
    },
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

  if (pending.isError) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 p-6 text-sm">
        <p>Couldn't load the applications: {pending.error.message}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void pending.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const applications = pending.data?.items ?? [];
  const counts = pending.data?.counts;
  const total = counts
    ? counts.approve + counts.unsure + counts.reject + counts.none
    : 0;
  const inFilter = counts?.[filter] ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Pending applications</h2>
        <p className="text-sm text-muted-foreground">{total} waiting</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            role="tab"
            aria-selected={filter === key}
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="ml-1.5 tabular-nums opacity-70">
              {counts?.[key] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      {inFilter > applications.length ? (
        <p className="text-sm text-muted-foreground">
          Newest {applications.length} of {inFilter} shown. Decide some and the
          next ones appear.
        </p>
      ) : null}

      {applications.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {filter === "none" ? "Everything has been checked." : "Nothing here."}
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
