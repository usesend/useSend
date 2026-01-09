"use client";

import { use, useState } from "react";
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
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default function SegmentDetailPage({
  params,
}: {
  params: Promise<{ contactBookId: string; segmentId: string }>;
}) {
  const { contactBookId, segmentId } = use(params);
  const [page, setPage] = useState(1);

  const segmentQuery = api.segment.get.useQuery({ contactBookId, segmentId });
  const contactsQuery = api.segment.getContacts.useQuery({
    contactBookId,
    segmentId,
    page,
    limit: 30,
  });

  if (segmentQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const segment = segmentQuery.data;

  if (!segment) {
    return (
      <div className="text-center py-12">
        <p>Segment not found</p>
        <Link href={`/contacts/${contactBookId}/segments`}>
          <Button variant="link">Back to segments</Button>
        </Link>
      </div>
    );
  }

  const filters = segment.filters as Array<{
    field: string;
    operator: string;
    value?: string;
  }>;
  const contacts = contactsQuery.data?.contacts ?? [];
  const totalPages = contactsQuery.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/contacts/${contactBookId}/segments`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-lg font-semibold">{segment.name}</h2>
            {segment.description && (
              <p className="text-sm text-muted-foreground">
                {segment.description}
              </p>
            )}
          </div>
        </div>
        <Badge variant="secondary" className="text-base px-4 py-2">
          <Users className="h-4 w-4 mr-2" />
          {segment.contactCount.toLocaleString()} contacts
        </Badge>
      </div>

      {/* Filters Display */}
      <div className="flex flex-wrap gap-2">
        {filters.map((filter, idx) => (
          <Badge key={idx} variant="outline">
            {filter.field}{" "}
            <span className="text-muted-foreground mx-1">
              {filter.operator.replace(/_/g, " ")}
            </span>
            {filter.value && <span className="font-mono">{filter.value}</span>}
          </Badge>
        ))}
      </div>

      {/* Contacts Table */}
      <div className="flex flex-col rounded-xl border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted dark:bg-muted/70">
              <TableHead className="rounded-tl-xl">Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right rounded-tr-xl">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contactsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  <Spinner className="w-5 h-5 mx-auto" />
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No contacts match this segment
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">{contact.email}</TableCell>
                  <TableCell>
                    {contact.firstName || contact.lastName
                      ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={contact.subscribed ? "default" : "secondary"}>
                      {contact.subscribed ? "Subscribed" : "Unsubscribed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDistanceToNow(contact.createdAt, { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
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
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
