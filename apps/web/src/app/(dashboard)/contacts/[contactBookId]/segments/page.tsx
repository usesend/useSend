"use client";

import { use } from "react";
import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
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
import { ArrowLeft, Filter, Plus, Users } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import CreateSegment from "./create-segment";
import DeleteSegment from "./delete-segment";

export default function SegmentsPage({
  params,
}: {
  params: Promise<{ contactBookId: string }>;
}) {
  const { contactBookId } = use(params);
  const segmentsQuery = api.segment.list.useQuery({ contactBookId });

  if (segmentsQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const segments = segmentsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/contacts/${contactBookId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-lg font-semibold">Segments</h2>
            <p className="text-sm text-muted-foreground">
              Create dynamic groups of contacts based on filters
            </p>
          </div>
        </div>
        <CreateSegment contactBookId={contactBookId} />
      </div>

      {segments.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-muted/30">
          <Filter className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No segments yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a segment to group contacts by specific criteria.
          </p>
          <CreateSegment contactBookId={contactBookId} />
        </div>
      ) : (
        <div className="flex flex-col rounded-xl border shadow">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted dark:bg-muted/70">
                <TableHead className="rounded-tl-xl">Name</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Filters</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right rounded-tr-xl">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => {
                const filters = segment.filters as Array<{ field: string }>;
                return (
                  <TableRow key={segment.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{segment.name}</div>
                        {segment.description && (
                          <div className="text-sm text-muted-foreground">
                            {segment.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <Users className="h-3 w-3 mr-1" />
                        {segment.contactCount.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {filters.slice(0, 3).map((filter, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {filter.field}
                          </Badge>
                        ))}
                        {filters.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{filters.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(segment.createdAt, { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/contacts/${contactBookId}/segments/${segment.id}`}
                        >
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </Link>
                        <DeleteSegment
                          segment={segment}
                          contactBookId={contactBookId}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
