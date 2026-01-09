"use client";

import { useState } from "react";
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
import { Copy, Users } from "lucide-react";
import MergeDuplicates from "./merge-duplicates";

export default function DuplicatesList() {
  const [page, setPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const duplicatesQuery = api.contacts.findDuplicates.useQuery({
    page,
    limit: 20,
  });

  const { duplicates, pagination } = duplicatesQuery.data ?? {
    duplicates: [],
    pagination: { page: 1, totalPages: 1, hasNext: false, hasPrev: false },
  };

  if (duplicatesQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (duplicates.length === 0) {
    return (
      <div className="text-center py-16 border rounded-xl bg-muted/30">
        <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No duplicates found</h3>
        <p className="text-muted-foreground">
          All your contacts are unique across contact books.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col rounded-xl border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted dark:bg-muted/70">
              <TableHead className="rounded-tl-xl">Email</TableHead>
              <TableHead>Appears In</TableHead>
              <TableHead>Contact Books</TableHead>
              <TableHead className="text-right rounded-tr-xl">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {duplicates.map((duplicate) => (
              <TableRow key={duplicate.email}>
                <TableCell className="font-medium">{duplicate.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {duplicate.count} contact books
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {duplicate.contactBookNames.slice(0, 3).map((name, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                    {duplicate.contactBookNames.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{duplicate.contactBookNames.length - 3} more
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedEmail(duplicate.email)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Showing {duplicates.length} of {pagination.totalCount ?? 0} duplicates
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => p - 1)}
            disabled={!pagination.hasPrev}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={!pagination.hasNext}
          >
            Next
          </Button>
        </div>
      </div>

      {selectedEmail && (
        <MergeDuplicates
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      )}
    </div>
  );
}
