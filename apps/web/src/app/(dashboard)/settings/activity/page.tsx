"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Badge } from "@usesend/ui/src/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { Spinner } from "@usesend/ui/src/spinner";
import { formatDistanceToNow, format } from "date-fns";
import { AuditAction, AuditResourceType } from "@prisma/client";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";

const ACTION_COLORS: Record<AuditAction, string> = {
  CREATE: "bg-green/15 text-green border-green/25",
  UPDATE: "bg-blue/15 text-blue border-blue/25",
  DELETE: "bg-red/15 text-red border-red/25",
  SEND: "bg-purple/15 text-purple border-purple/25",
  PAUSE: "bg-yellow/15 text-yellow border-yellow/25",
  RESUME: "bg-cyan/15 text-cyan border-cyan/25",
  SCHEDULE: "bg-indigo/15 text-indigo border-indigo/25",
  LOGIN: "bg-gray/15 text-gray border-gray/25",
  INVITE: "bg-pink/15 text-pink border-pink/25",
  EXPORT: "bg-orange/15 text-orange border-orange/25",
};

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<AuditAction | "all">("all");
  const [resourceFilter, setResourceFilter] = useState<
    AuditResourceType | "all"
  >("all");

  const logsQuery = api.auditLog.list.useQuery({
    page,
    action: actionFilter === "all" ? undefined : actionFilter,
    resourceType: resourceFilter === "all" ? undefined : resourceFilter,
  });

  const summaryQuery = api.auditLog.getSummary.useQuery({ days: 30 });

  const exportMutation = api.auditLog.export.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.data], {
        type: data.format === "csv" ? "text/csv" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.${data.format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Audit log exported");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleExport = (format: "json" | "csv") => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    exportMutation.mutate({
      startDate,
      endDate,
      format,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            Track all team activity and changes for compliance and auditing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryQuery.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{logsQuery.data?.total ?? 0}</p>
            <p className="text-sm text-muted-foreground">Total Events</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">
              {summaryQuery.data.activeUsers.length}
            </p>
            <p className="text-sm text-muted-foreground">Active Users</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">
              {summaryQuery.data.byAction.find((a) => a.action === "CREATE")
                ?.count ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">Items Created</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">
              {summaryQuery.data.byAction.find((a) => a.action === "SEND")
                ?.count ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">Sends Triggered</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v as AuditAction | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {Object.values(AuditAction).map((action) => (
              <SelectItem key={action} value={action}>
                {action.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={resourceFilter}
          onValueChange={(v) => {
            setResourceFilter(v as AuditResourceType | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {Object.values(AuditResourceType).map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => logsQuery.refetch()}
          disabled={logsQuery.isRefetching}
        >
          <RefreshCw
            className={`h-4 w-4 ${logsQuery.isRefetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Logs Table */}
      <div className="rounded-xl border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="rounded-tl-xl">Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className="rounded-tr-xl">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Spinner className="w-5 h-5 mx-auto" />
                </TableCell>
              </TableRow>
            ) : logsQuery.data?.logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  No activity logs found
                </TableCell>
              </TableRow>
            ) : (
              logsQuery.data?.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    <div
                      title={format(log.createdAt, "PPpp")}
                      className="whitespace-nowrap"
                    >
                      {formatDistanceToNow(log.createdAt, { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {log.user?.image ? (
                        <img
                          src={log.user.image}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                          {log.user?.name?.[0] || log.user?.email?.[0] || "?"}
                        </div>
                      )}
                      <span className="text-sm">
                        {log.user?.name || log.user?.email || "System"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={ACTION_COLORS[log.action]}
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        {log.resourceType.replace("_", " ")}
                      </span>
                      {log.resourceName && (
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {log.resourceName}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.details && (
                      <pre className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {JSON.stringify(log.details)}
                      </pre>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {logsQuery.data && logsQuery.data.totalPages > 1 && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="flex items-center px-3 text-sm text-muted-foreground">
            Page {page} of {logsQuery.data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= logsQuery.data.totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
