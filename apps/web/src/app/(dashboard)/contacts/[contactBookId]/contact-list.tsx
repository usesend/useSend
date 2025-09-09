"use client";

import { Button } from "@usesend/ui/src/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import Spinner from "@usesend/ui/src/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import { useUrlState } from "~/hooks/useUrlState";
import { api } from "~/trpc/react";
import { getGravatarUrl } from "~/utils/gravatar-utils";
import DeleteContact from "./delete-contact";
import EditContact from "./edit-contact";
import { Input } from "@usesend/ui/src/input";
import { useDebouncedCallback } from "use-debounce";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import { UnsubscribeReason } from "@prisma/client";

function getUnsubscribeReason(reason: UnsubscribeReason) {
  switch (reason) {
    case UnsubscribeReason.BOUNCED:
      return "Email bounced";
    case UnsubscribeReason.COMPLAINED:
      return "User complained";
    case UnsubscribeReason.UNSUBSCRIBED:
      return "User unsubscribed";
    default:
      return "User unsubscribed";
  }
}

export default function ContactList({
  contactBookId,
}: {
  contactBookId: string;
}) {
  const [page, setPage] = useUrlState("page", "1");
  const [status, setStatus] = useUrlState("status");
  const [search, setSearch] = useUrlState("search");

  const pageNumber = Number(page);

  const contactsQuery = api.contacts.contacts.useQuery({
    contactBookId,
    page: pageNumber,
    search: search ?? undefined,
    subscribed:
      status === "Subscribed"
        ? true
        : status === "Unsubscribed"
          ? false
          : undefined,
  });

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
  }, 1000);

  return (
    <TooltipProvider>
      <div className="mt-10 flex flex-col gap-4">
        <div className="flex justify-between">
          <div>
            <Input
              placeholder="Search by email or name"
              className="w-[350px] mr-4"
              defaultValue={search ?? ""}
              onChange={(e) => debouncedSearch(e.target.value)}
            />
          </div>
          <Select
            value={status ?? "All"}
            onValueChange={(val) => setStatus(val === "All" ? null : val)}
          >
            <SelectTrigger className="w-[180px] capitalize">
              {status || "All statuses"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All" className=" capitalize">
                All statuses
              </SelectItem>
              <SelectItem value="Subscribed" className=" capitalize">
                Subscribed
              </SelectItem>
              <SelectItem value="Unsubscribed" className=" capitalize">
                Unsubscribed
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col rounded-xl border border-broder shadow">
          <Table className="">
            <TableHeader className="">
              <TableRow className=" bg-muted/30">
                <TableHead className="rounded-tl-xl">Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="">Created At</TableHead>
                <TableHead className="rounded-tr-xl">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contactsQuery.isLoading ? (
                <TableRow className="h-32">
                  <TableCell colSpan={4} className="text-center py-4">
                    <Spinner
                      className="w-6 h-6 mx-auto"
                      innerSvgClass="stroke-primary"
                    />
                  </TableCell>
                </TableRow>
              ) : contactsQuery.data?.contacts.length ? (
                contactsQuery.data?.contacts.map((contact) => (
                  <TableRow key={contact.id} className="">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Image
                          src={getGravatarUrl(contact.email, {
                            size: 75,
                            defaultImage: "robohash",
                          })}
                          alt={contact.email + "'s gravatar"}
                          width={35}
                          height={35}
                          className="rounded-full"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {contact.email}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {contact.firstName} {contact.lastName}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.subscribed ? (
                        <div className="text-center w-[130px] rounded capitalize py-1 text-xs bg-green/15 text-green border border-green/25">
                          Subscribed
                        </div>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="text-center w-[130px] rounded capitalize py-1 text-xs bg-red/10 text-red border border-red/10">
                              Unsubscribed
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {getUnsubscribeReason(
                                contact.unsubscribeReason ??
                                  UnsubscribeReason.UNSUBSCRIBED,
                              )}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell className="">
                      {formatDistanceToNow(new Date(contact.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <EditContact contact={contact} />
                        <DeleteContact contact={contact} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="h-32">
                  <TableCell colSpan={4} className="text-center py-4">
                    No contacts found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-4 justify-end">
          <Button
            size="sm"
            onClick={() => setPage((pageNumber - 1).toString())}
            disabled={pageNumber === 1}
          >
            Previous
          </Button>
          <Button
            size="sm"
            onClick={() => setPage((pageNumber + 1).toString())}
            disabled={pageNumber >= (contactsQuery.data?.totalPage ?? 0)}
          >
            Next
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
