"use client";

import { useState } from "react";
import { WebhookCallStatus } from "@prisma/client";
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
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";
import { formatDistanceToNow } from "date-fns";
import { WebhookCallStatusBadge } from "../webhook-call-status-badge";

const PAGE_SIZE = 20;

export function WebhookCallsTable({
  webhookId,
  selectedCallId,
  onSelectCall,
}: {
  webhookId: string;
  selectedCallId: string | null;
  onSelectCall: (callId: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<WebhookCallStatus | "ALL">(
    "ALL",
  );
  const [cursors, setCursors] = useState<string[]>([]);

  const currentCursor = cursors[cursors.length - 1];

  const callsQuery = api.webhook.listCalls.useQuery({
    webhookId,
    status: statusFilter === "ALL" ? undefined : statusFilter,
    limit: PAGE_SIZE,
    cursor: currentCursor,
  });

  const calls = callsQuery.data?.items ?? [];
  const nextCursor = callsQuery.data?.nextCursor;

  const handleNextPage = () => {
    if (nextCursor) {
      setCursors([...cursors, nextCursor]);
    }
  };

  const handlePrevPage = () => {
    setCursors(cursors.slice(0, -1));
  };

  const handleFilterChange = (value: WebhookCallStatus | "ALL") => {
    setStatusFilter(value);
    setCursors([]);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-row items-center justify-between mb-4">
        <h2 className="text-base font-medium">Delivery Logs</h2>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            handleFilterChange(value as WebhookCallStatus | "ALL")
          }
        >
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value={WebhookCallStatus.DELIVERED}>
              Delivered
            </SelectItem>
            <SelectItem value={WebhookCallStatus.FAILED}>Failed</SelectItem>
            <SelectItem value={WebhookCallStatus.PENDING}>Pending</SelectItem>
            <SelectItem value={WebhookCallStatus.IN_PROGRESS}>
              In Progress
            </SelectItem>
            <SelectItem value={WebhookCallStatus.DISCARDED}>
              Discarded
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border shadow flex flex-col">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-muted dark:bg-muted/70">
              <TableHead className="h-9 rounded-tl-xl">Status</TableHead>
              <TableHead className="h-9">Event Type</TableHead>
              <TableHead className="h-9 rounded-tr-xl">Time</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
        <div className="flex-1 overflow-auto no-scrollbar">
          <Table>
            <TableBody>
              {callsQuery.isLoading ? (
                <TableRow className="h-32 hover:bg-transparent">
                  <TableCell colSpan={3} className="py-4 text-center">
                    <Spinner
                      className="mx-auto h-6 w-6"
                      innerSvgClass="stroke-primary"
                    />
                  </TableCell>
                </TableRow>
              ) : calls.length === 0 ? (
                <TableRow className="h-32 hover:bg-transparent">
                  <TableCell colSpan={3} className="py-4 text-center">
                    <p className="text-muted-foreground text-sm">
                      No webhook calls yet
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                calls.map((call) => (
                  <TableRow
                    key={call.id}
                    className={`cursor-pointer transition-colors ${
                      selectedCallId === call.id
                        ? "bg-accent/50 text-accent-foreground"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => onSelectCall(call.id)}
                  >
                    <TableCell className="py-2">
                      <div className="scale-90 origin-left">
                        <WebhookCallStatusBadge status={call.status} />
                      </div>
                    </TableCell>
                    <TableCell className="py-2 font-mono text-xs">
                      {call.type}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(call.createdAt, {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="flex gap-4 justify-end mt-4">
        <Button
          size="sm"
          onClick={handlePrevPage}
          disabled={cursors.length === 0}
        >
          Previous
        </Button>
        <Button size="sm" onClick={handleNextPage} disabled={!nextCursor}>
          Next
        </Button>
      </div>
    </div>
  );
}
