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
import {
  Mail,
  MailCheck,
  MailOpen,
  MailSearch,
  MailWarning,
  MailX,
  Download,
} from "lucide-react";
import { formatDate, formatDistanceToNow } from "date-fns";
import { EmailStatus } from "@prisma/client";
import { EmailStatusBadge } from "./email-status-badge";
import EmailDetails from "./email-details";
import dynamic from "next/dynamic";
import { useUrlState } from "~/hooks/useUrlState";
import { Button } from "@usesend/ui/src/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import Spinner from "@usesend/ui/src/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import { Input } from "@usesend/ui/src/input";
import { DEFAULT_QUERY_LIMIT } from "~/lib/constants";
import { useDebouncedCallback } from "use-debounce";
import { useState } from "react";
import { SheetTitle, SheetDescription } from "@usesend/ui/src/sheet";

/* Stupid hydrating error. And I so stupid to understand the stupid NextJS docs */
const DynamicSheetWithNoSSR = dynamic(
  () => import("@usesend/ui/src/sheet").then((mod) => mod.Sheet),
  { ssr: false },
);

const DynamicSheetContentWithNoSSR = dynamic(
  () => import("@usesend/ui/src/sheet").then((mod) => mod.SheetContent),
  { ssr: false },
);

export default function EmailsList() {
  const [selectedEmail, setSelectedEmail] = useUrlState("emailId");
  const [page, setPage] = useUrlState("page", "1");
  const [status, setStatus] = useUrlState("status");
  const [search, setSearch] = useUrlState("search");
  const [domain, setDomain] = useUrlState("domain");
  const [apiKey, setApiKey] = useUrlState("apikey");

  const pageNumber = Number(page);
  const domainId = domain ? Number(domain) : undefined;
  const apiId = apiKey ? Number(apiKey) : undefined;

  const emailsQuery = api.email.emails.useQuery({
    page: pageNumber,
    status: status?.toUpperCase() as EmailStatus,
    domain: domainId,
    search,
    apiId: apiId,
  });

  const exportQuery = api.email.exportEmails.useQuery(
    {
      status: status?.toUpperCase() as EmailStatus,
      domain: domainId,
      search,
      apiId: apiId,
    },
    { enabled: false },
  );

  const { data: domainsQuery } = api.domain.domains.useQuery();
  const { data: apiKeysQuery } = api.apiKey.getApiKeys.useQuery();

  const handleSelectEmail = (emailId: string) => {
    setSelectedEmail(emailId);
  };

  const handleDomain = (val: string) => {
    setDomain(val === "All Domains" ? null : val);
  };

  const handleApiKey = (val: string) => {
    setApiKey(val === "All API Keys" ? null : val);
  };

  const handleSheetChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedEmail(null);
    }
  };

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
  }, 1000);

  const handleExport = async () => {
    try {
      const resp = await exportQuery.refetch();
      if (!resp.data) return;

      const escape = (val: unknown) => {
        const s = String(val ?? "");
        const startsRisky = /^\s*[=+\-@]/.test(s);
        const safe = (startsRisky ? "'" : "") + s.replace(/"/g, '""');
        return /[",\r\n]/.test(safe) ? `"${safe}"` : safe;
      };

      const header = [
        "To",
        "Status",
        "Subject",
        "Sent At",
        "Bounce Type",
        "Bounce Subtype",
        "Bounce Reason",
      ].join(",");
      const rows = resp.data.map((e) =>
        [
          e.to,
          e.status,
          e.subject,
          e.sentAt,
          e.bounceType,
          e.bounceSubType,
          e.bounceReason,
        ]
          .map(escape)
          .join(","),
      );
      const csv = [header, ...rows].join("\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `emails-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  return (
    <div className="mt-10 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <Input
          placeholder="Search by subject or email"
          className="w-[350px] mr-4 h-9"
          defaultValue={search ?? ""}
          onChange={(e) => debouncedSearch(e.target.value)}
        />
        <div className="flex justify-center items-center gap-x-3">
          <Select
            value={apiKey ?? "All API Keys"}
            onValueChange={(val) => handleApiKey(val)}
          >
            <SelectTrigger className="w-[140px]">
              {apiKey
                ? apiKeysQuery?.find((apikey) => apikey.id === Number(apiKey))
                    ?.name
                : "All API Keys"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All API Keys">All API Keys</SelectItem>
              {apiKeysQuery &&
                apiKeysQuery.map((apikey) => (
                  <SelectItem key={apikey.id} value={apikey.id.toString()}>
                    {apikey.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={domain ?? "All Domains"}
            onValueChange={(val) => handleDomain(val)}
          >
            <SelectTrigger className="w-[140px]">
              {domain
                ? domainsQuery?.find((d) => d.id === Number(domain))?.name
                : "All Domains"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Domains" className=" capitalize">
                All Domains
              </SelectItem>
              {domainsQuery &&
                domainsQuery.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id.toString()}>
                    {domain.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={status ?? "All statuses"}
            onValueChange={(val) =>
              setStatus(val === "All statuses" ? null : val)
            }
          >
            <SelectTrigger className="w-[140px] capitalize">
              {status ? status.toLowerCase().replace("_", " ") : "All statuses"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All statuses" className=" capitalize">
                All statuses
              </SelectItem>
              {Object.values([
                "SENT",
                "SCHEDULED",
                "QUEUED",
                "DELIVERED",
                "BOUNCED",
                "CLICKED",
                "OPENED",
                "DELIVERY_DELAYED",
                "COMPLAINED",
                "SUPPRESSED",
              ]).map((status) => (
                <SelectItem key={status} value={status} className=" capitalize">
                  {status.toLowerCase().replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exportQuery.isFetching}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
      <div className="flex flex-col rounded-xl border shadow">
        <Table className="">
          <TableHeader className="">
            <TableRow className=" bg-muted dark:bg-muted/70">
              <TableHead className="rounded-tl-xl">To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="text-right rounded-tr-xl">
                Sent at
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emailsQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={4} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : emailsQuery.data?.emails.length ? (
              emailsQuery.data?.emails.map((email) => (
                <TableRow
                  key={email.id}
                  onClick={() => handleSelectEmail(email.id)}
                  className=" cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <div className="flex gap-4 items-center">
                      {/* <EmailIcon status={email.latestStatus ?? "Sent"} /> */}
                      <p> {email.to}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {email.latestStatus === "SCHEDULED" && email.scheduledAt ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <EmailStatusBadge
                              status={email.latestStatus ?? "Sent"}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            Scheduled at{" "}
                            {formatDate(
                              email.scheduledAt,
                              "MMM dd'th', hh:mm a",
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <EmailStatusBadge status={email.latestStatus ?? "Sent"} />
                    )}
                  </TableCell>
                  <TableCell className="">
                    <div className=" max-w-xs truncate">{email.subject}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {email.latestStatus !== "SCHEDULED"
                      ? formatDate(
                          email.scheduledAt ?? email.createdAt,
                          "MMM do, hh:mm a",
                        )
                      : "--"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="h-32">
                <TableCell colSpan={4} className="text-center py-4">
                  No emails found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <DynamicSheetWithNoSSR
          open={!!selectedEmail}
          onOpenChange={handleSheetChange}
        >
          <DynamicSheetContentWithNoSSR className="sm:max-w-3xl overflow-y-auto no-scrollbar">
            <SheetTitle className="sr-only">Email Details</SheetTitle>
            <SheetDescription className="sr-only">
              Detailed view of the selected email.
            </SheetDescription>
            {selectedEmail ? <EmailDetails emailId={selectedEmail} /> : null}
          </DynamicSheetContentWithNoSSR>
        </DynamicSheetWithNoSSR>
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
          disabled={emailsQuery.data?.emails.length !== DEFAULT_QUERY_LIMIT}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

const EmailIcon: React.FC<{ status: EmailStatus }> = ({ status }) => {
  switch (status) {
    case "SENT":
      return (
        // <div className="border border-gray-400/60 p-2 rounded-lg bg-gray-400/10">
        <Mail className="w-6 h-6 text-gray" />
        // </div>
      );
    case "DELIVERED":
      return (
        // <div className="border border-emerald-600/60 p-2 rounded-lg bg-emerald-500/10">
        <MailCheck className="w-6 h-6 text-green" />
        // </div>
      );
    case "BOUNCED":
    case "FAILED":
      return (
        // <div className="border border-red-600/60 p-2 rounded-lg bg-red-500/10">
        <MailX className="w-6 h-6 text-red" />
        // </div>
      );
    case "CLICKED":
      return (
        // <div className="border border-cyan-600/60 p-2 rounded-lg bg-cyan-500/10">
        <MailSearch className="w-6 h-6 text-blue" />
        // </div>
      );
    case "OPENED":
      return (
        // <div className="border border-indigo-600/60 p-2 rounded-lg bg-indigo-500/10">
        <MailOpen className="w-6 h-6 text-purple" />
        // </div>
      );
    case "DELIVERY_DELAYED":
    case "COMPLAINED":
      return (
        // <div className="border border-yellow-600/60 p-2 rounded-lg bg-yellow-500/10">
        <MailWarning className="w-6 h-6 text-yellow" />
        // </div>
      );
    default:
      return (
        // <div className="border border-gray-400/60 p-2 rounded-lg">
        <Mail className="w-6 h-6" />
        // </div>
      );
  }
};
