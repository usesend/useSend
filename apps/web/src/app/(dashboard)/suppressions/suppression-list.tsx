"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { useUrlState } from "~/hooks/useUrlState";
import { useDebouncedCallback } from "use-debounce";
import { SuppressionReason } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { Trash2, Download } from "lucide-react";
import RemoveSuppressionDialog from "./remove-suppression";
import Spinner from "@usesend/ui/src/spinner";

const reasonLabels = {
  HARD_BOUNCE: "Hard Bounce",
  COMPLAINT: "Complaint",
  MANUAL: "Manual",
} as const;

export default function SuppressionList() {
  const [search, setSearch] = useUrlState("search");
  const [reason, setReason] = useUrlState("reason");
  const [page, setPage] = useUrlState("page", "1");
  const [emailToRemove, setEmailToRemove] = useState<string | null>(null);

  const suppressionsQuery = api.suppression.getSuppressions.useQuery({
    page: parseInt(page || "1"),
    limit: 20,
    search: search || undefined,
    reason: reason as SuppressionReason | undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const exportQuery = api.suppression.exportSuppressions.useQuery(
    {
      search: search || undefined,
      reason: reason as SuppressionReason | undefined,
    },
    { enabled: false }
  );

  const utils = api.useUtils();

  const removeMutation = api.suppression.removeSuppression.useMutation({
    onSuccess: () => {
      utils.suppression.getSuppressions.invalidate();
      utils.suppression.getSuppressionStats.invalidate();
      setEmailToRemove(null);
    },
  });

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value || null);
    setPage("1");
  }, 1000);

  const handleReasonFilter = (value: string) => {
    setReason(value === "all" ? null : value);
    setPage("1");
  };

  const handleExport = async () => {
    const resp = await exportQuery.refetch();

    if (resp.data) {
      const csv = [
        "Email,Reason,Created At",
        ...resp.data.map(
          (suppression) =>
            `${suppression.email},${suppression.reason},${suppression.createdAt}`
        ),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `suppressions-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const handleRemove = (email: string) => {
    setEmailToRemove(email);
  };

  const confirmRemove = () => {
    if (emailToRemove) {
      removeMutation.mutate({ email: emailToRemove });
    }
  };

  return (
    <div className="mt-10 flex flex-col gap-4">
      {/* Header and Export */}
      <div className="flex justify-between items-center">
        {/* Filters */}
        <div className="flex gap-4">
          <Input
            placeholder="Search by email address..."
            className="max-w-sm"
            defaultValue={search || ""}
            onChange={(e) => debouncedSearch(e.target.value)}
          />
          <Select value={reason || "all"} onValueChange={handleReasonFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reasons</SelectItem>
              <SelectItem value="HARD_BOUNCE">Hard Bounce</SelectItem>
              <SelectItem value="COMPLAINT">Complaint</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>{" "}
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exportQuery.isFetching}
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Table */}
      <div className="flex flex-col rounded-xl border shadow">
        <Table className="">
          <TableHeader className="">
            <TableRow className=" bg-muted/30">
              <TableHead className="rounded-tl-xl">Email</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="rounded-tr-xl">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppressionsQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={4} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : suppressionsQuery.data?.suppressions.length === 0 ? (
              <TableRow className="h-32">
                <TableCell colSpan={4} className="text-center py-4">
                  No suppressed emails found
                </TableCell>
              </TableRow>
            ) : (
              suppressionsQuery.data?.suppressions.map((suppression) => (
                <TableRow key={suppression.id}>
                  <TableCell className="font-medium">
                    {suppression.email}
                  </TableCell>
                  <TableCell>
                    <div
                      className={`text-center w-[130px] rounded capitalize py-1 text-xs ${
                        suppression.reason === "HARD_BOUNCE"
                          ? "bg-red/15 text-red border border-red/20"
                          : suppression.reason === "COMPLAINT"
                            ? "bg-yellow/15 text-yellow border border-yellow/20"
                            : "bg-blue/15 text-blue border border-blue/20"
                      }`}
                    >
                      {reasonLabels[suppression.reason]}
                    </div>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(suppression.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(suppression.email)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex gap-4 justify-end">
        <Button
          size="sm"
          onClick={() => setPage(String(parseInt(page || "1") - 1))}
          disabled={parseInt(page || "1") === 1}
        >
          Previous
        </Button>
        <Button
          size="sm"
          onClick={() => setPage(String(parseInt(page || "1") + 1))}
          disabled={!suppressionsQuery.data?.pagination?.hasNext}
        >
          Next
        </Button>
      </div>

      <RemoveSuppressionDialog
        email={emailToRemove}
        open={!!emailToRemove}
        onOpenChange={(open) => !open && setEmailToRemove(null)}
        onConfirm={confirmRemove}
        isLoading={removeMutation.isPending}
      />
    </div>
  );
}
