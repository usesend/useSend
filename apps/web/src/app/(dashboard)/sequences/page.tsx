"use client";

import { useState } from "react";
import Link from "next/link";
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
import { formatDistanceToNow } from "date-fns";
import { SequenceStatus } from "@prisma/client";
import { Plus, Workflow, Users, Mail } from "lucide-react";
import { CreateSequenceDialog } from "./create-sequence-dialog";

const STATUS_COLORS: Record<SequenceStatus, string> = {
  DRAFT: "bg-gray/15 text-gray border-gray/25",
  ACTIVE: "bg-green/15 text-green border-green/25",
  PAUSED: "bg-yellow/15 text-yellow border-yellow/25",
  ARCHIVED: "bg-muted text-muted-foreground border-muted",
};

export default function SequencesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<SequenceStatus | "all">(
    "all"
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const sequencesQuery = api.sequence.list.useQuery({
    page,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Automation Sequences</h1>
          <p className="text-muted-foreground text-sm">
            Create automated email sequences to nurture your contacts
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Sequence
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as SequenceStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.values(SequenceStatus).map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sequences Table */}
      <div className="rounded-xl border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="rounded-tl-xl">Sequence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact Book</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Enrolled</TableHead>
              <TableHead className="rounded-tr-xl">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sequencesQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Spinner className="w-5 h-5 mx-auto" />
                </TableCell>
              </TableRow>
            ) : sequencesQuery.data?.sequences.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-3">
                    <Workflow className="h-10 w-10 text-muted-foreground/50" />
                    <div>
                      <p className="font-medium">No sequences yet</p>
                      <p className="text-sm">
                        Create your first automation sequence to get started
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Sequence
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sequencesQuery.data?.sequences.map((sequence) => (
                <TableRow key={sequence.id}>
                  <TableCell>
                    <Link
                      href={`/sequences/${sequence.id}`}
                      className="hover:underline font-medium"
                    >
                      {sequence.name}
                    </Link>
                    {sequence.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                        {sequence.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[sequence.status]}
                    >
                      {sequence.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {sequence.contactBook ? (
                      <div className="flex items-center gap-2">
                        <span>{sequence.contactBook.emoji}</span>
                        <span className="text-sm">
                          {sequence.contactBook.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        Not set
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground capitalize">
                      {sequence.triggerType.replace("_", " ").toLowerCase()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-sm">
                        {sequence._count.steps}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-sm">
                        {sequence.totalEnrolled}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(sequence.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {sequencesQuery.data && sequencesQuery.data.totalPages > 1 && (
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
            Page {page} of {sequencesQuery.data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= sequencesQuery.data.totalPages}
          >
            Next
          </Button>
        </div>
      )}

      <CreateSequenceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
