"use client";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@usesend/ui/src/table";
import { api } from "~/trpc/react";
import Spinner from "@usesend/ui/src/spinner";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@usesend/ui/src/badge";
import { Switch } from "@usesend/ui/src/switch";
import DeleteReport from "./delete-report";
import EditReport from "./edit-report";

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatSchedule(report: {
  frequency: string;
  hour: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timezone: string;
}) {
  const hourFormatted = format(new Date().setHours(report.hour, 0), "h:mm a");

  switch (report.frequency) {
    case "DAILY":
      return `Daily at ${hourFormatted}`;
    case "WEEKLY":
      return `Weekly on ${DAYS_OF_WEEK[report.dayOfWeek ?? 0]} at ${hourFormatted}`;
    case "MONTHLY":
      return `Monthly on day ${report.dayOfMonth ?? 1} at ${hourFormatted}`;
    default:
      return report.frequency;
  }
}

export default function ReportsList() {
  const reportsQuery = api.scheduledReport.list.useQuery();
  const utils = api.useUtils();

  const toggleMutation = api.scheduledReport.toggle.useMutation({
    onMutate: async ({ id }) => {
      await utils.scheduledReport.list.cancel();
      const previous = utils.scheduledReport.list.getData();
      utils.scheduledReport.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((r) =>
          r.id === id ? { ...r, enabled: !r.enabled } : r
        );
      });
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        utils.scheduledReport.list.setData(undefined, context.previous);
      }
    },
    onSettled: () => {
      utils.scheduledReport.list.invalidate();
    },
  });

  const reports = reportsQuery.data ?? [];
  const isLoading = reportsQuery.isLoading;

  return (
    <div className="mt-10 flex flex-col gap-4">
      <div className="flex flex-col rounded-xl border border-border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="rounded-tl-xl">Name</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Next Send</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="rounded-tr-xl">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : reports.length > 0 ? (
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {report.recipients.slice(0, 2).map((email, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {email}
                        </Badge>
                      ))}
                      {report.recipients.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{report.recipients.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{formatSchedule(report)}</span>
                  </TableCell>
                  <TableCell>
                    {report.nextSendAt ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(report.nextSendAt, {
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={report.enabled}
                      onCheckedChange={() =>
                        toggleMutation.mutate({ id: report.id })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <EditReport report={report} />
                      <DeleteReport report={report} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                  No scheduled reports yet. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
