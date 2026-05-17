"use client";

import { api } from "~/trpc/react";
import { DomainStatus } from "@prisma/client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@usesend/ui/src/breadcrumb";
import { DomainStatusBadge } from "../domain-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";
import React, { use } from "react";
import { Switch } from "@usesend/ui/src/switch";
import DeleteDomain from "./delete-domain";
import SendTestMail from "./send-test-mail";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import Link from "next/link";
import { toast } from "@usesend/ui/src/toaster";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DomainResponse = NonNullable<RouterOutputs["domain"]["getDomain"]>;

export default function DomainItemPage({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  const { domainId } = use(params);

  const domainQuery = api.domain.getDomain.useQuery(
    {
      id: Number(domainId),
    },
    {
      refetchInterval: (q) => (q?.state.data?.isVerifying ? 10000 : false),
      refetchIntervalInBackground: true,
    },
  );

  const verifyQuery = api.domain.startVerification.useMutation();

  const handleVerify = () => {
    verifyQuery.mutate(
      { id: Number(domainId) },
      {
        onSettled: () => {
          domainQuery.refetch();
        },
      },
    );
  };

  return (
    <div>
      {domainQuery.isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center  gap-4">
              {/* <div className="flex items-center gap-4">
              <H1>{domainQuery.data?.name}</H1>
            </div> */}
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/domains" className="text-lg">
                        Domains
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-lg" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-lg ">
                      {domainQuery.data?.name}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="">
                <DomainStatusBadge
                  status={
                    domainQuery.data?.aggregateStatus ??
                    domainQuery.data?.status ??
                    DomainStatus.NOT_STARTED
                  }
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <Button variant="outline" onClick={handleVerify}>
                  {domainQuery.data?.isVerifying
                    ? "Verifying..."
                    : (domainQuery.data?.aggregateStatus ??
                        domainQuery.data?.status) === DomainStatus.SUCCESS
                      ? "Verify again"
                      : "Verify domain"}
                </Button>
              </div>
              {domainQuery.data ? (
                <SendTestMail domain={domainQuery.data} />
              ) : null}
            </div>
          </div>

          <div className=" border rounded-lg p-4 shadow">
            <p className="font-semibold text-xl">DNS records</p>
            <Table className="mt-2">
              <TableHeader className="">
                <TableRow className="">
                  <TableHead className="rounded-tl-xl">Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead className="">TTL</TableHead>
                  <TableHead className="">Priority</TableHead>
                  <TableHead className="rounded-tr-xl">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(domainQuery.data?.dnsRecords ?? []).map((record) => {
                  const key = `${record.type}-${record.name}`;
                  const valueClassName = record.name.includes("_domainkey")
                    ? "w-[200px] overflow-hidden text-ellipsis"
                    : "w-[200px] overflow-hidden text-ellipsis text-nowrap";

                  return (
                    <TableRow key={key}>
                      <TableCell className="">{record.type}</TableCell>
                      <TableCell>
                        <div className="flex gap-2 items-center">
                          {record.recommended ? (
                            <span className="text-sm text-muted-foreground">
                              (recommended)
                            </span>
                          ) : null}
                          <TextWithCopyButton value={record.name} />
                        </div>
                      </TableCell>
                      <TableCell className="">
                        <TextWithCopyButton
                          value={record.value}
                          className={valueClassName}
                        />
                      </TableCell>
                      <TableCell className="">{record.ttl}</TableCell>
                      <TableCell className="">{record.priority ?? ""}</TableCell>
                      <TableCell className="">
                        <DnsVerificationStatus status={record.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {domainQuery.data ? (
            <DomainSettings domain={domainQuery.data} />
          ) : null}
        </div>
      )}
    </div>
  );
}

const DomainSettings: React.FC<{ domain: DomainResponse }> = ({ domain }) => {
  const updateDomain = api.domain.updateDomain.useMutation();
  const setMailFromLabelMutation = api.domain.setMailFromLabel.useMutation();
  const utils = api.useUtils();

  const [clickTracking, setClickTracking] = React.useState(
    domain.clickTracking,
  );
  const [openTracking, setOpenTracking] = React.useState(domain.openTracking);
  const [mailFromDraft, setMailFromDraft] = React.useState(
    domain.mailFromLabel ?? "",
  );

  const effectiveMailFromLabel =
    domain.mailFromLabel?.trim() || domain.region;

  React.useEffect(() => {
    setMailFromDraft(domain.mailFromLabel ?? "");
  }, [domain.mailFromLabel]);

  function handleClickTrackingChange() {
    setClickTracking(!clickTracking);
    updateDomain.mutate(
      { id: domain.id, clickTracking: !clickTracking },
      {
        onSuccess: () => {
          utils.domain.invalidate();
          toast.success("Click tracking updated");
        },
      },
    );
  }

  function handleOpenTrackingChange() {
    setOpenTracking(!openTracking);
    updateDomain.mutate(
      { id: domain.id, openTracking: !openTracking },
      {
        onSuccess: () => {
          utils.domain.invalidate();
          toast.success("Open tracking updated");
        },
      },
    );
  }
  return (
    <div className="rounded-lg shadow p-4 border flex flex-col gap-6">
      <p className="font-semibold text-xl">Settings</p>

      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="font-semibold">MAIL FROM label</div>
        <p className="text-muted-foreground text-sm">
          The MX and SPF rows in the DNS table use this hostname label. By
          default it matches your SES region (
          <span className="font-mono text-xs">{domain.region}</span>). You can
          set a custom label (for example{" "}
          <span className="font-mono text-xs">bounce</span>) — a single DNS
          label, letters, digits, and hyphens only. Saving updates Amazon SES;
          then update DNS and run Verify.
        </p>
        <p className="text-muted-foreground text-sm">
          Tip: add the new MX and SPF records at your DNS provider{" "}
          <strong>before</strong> you save a new label here. That way SES can
          verify as soon as you save, and you avoid a temporary “not verified”
          state.
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Effective label:</span>{" "}
          <span className="font-mono text-xs">{effectiveMailFromLabel}</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-xs text-muted-foreground">
              Custom label (optional)
            </span>
            <Input
              placeholder={domain.region}
              value={mailFromDraft}
              onChange={(e) => setMailFromDraft(e.target.value)}
              disabled={setMailFromLabelMutation.isPending}
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={setMailFromLabelMutation.isPending}
            onClick={() => {
              const trimmed = mailFromDraft.trim();
              setMailFromLabelMutation.mutate(
                {
                  id: domain.id,
                  mailFromLabel:
                    trimmed === "" ? null : trimmed.toLowerCase(),
                },
                {
                  onSuccess: () => {
                    utils.domain.invalidate();
                    toast.success(
                      trimmed === ""
                        ? "MAIL FROM reset to region default"
                        : "MAIL FROM label updated — update DNS and verify",
                    );
                  },
                  onError: (err) => {
                    toast.error(err.message);
                  },
                },
              );
            }}
          >
            Save
          </Button>
          {domain.mailFromLabel ? (
            <Button
              type="button"
              variant="outline"
              disabled={setMailFromLabelMutation.isPending}
              onClick={() => {
                setMailFromLabelMutation.mutate(
                  { id: domain.id, mailFromLabel: null },
                  {
                    onSuccess: () => {
                      utils.domain.invalidate();
                      toast.success("MAIL FROM reset to region default");
                    },
                    onError: (err) => {
                      toast.error(err.message);
                    },
                  },
                );
              }}
            >
              Reset to default
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="font-semibold">Click tracking</div>
        <p className=" text-muted-foreground text-sm">
          Track any links in your emails content.{" "}
        </p>
        <Switch
          checked={clickTracking}
          onCheckedChange={handleClickTrackingChange}
          className="data-[state=checked]:bg-success"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="font-semibold">Open tracking</div>
        <p className=" text-muted-foreground text-sm">
          Unsend adds a tracking pixel to every email you send. This allows you
          to see how many people open your emails. This will affect the delivery
          rate of your emails.
        </p>
        <Switch
          checked={openTracking}
          onCheckedChange={handleOpenTrackingChange}
          className="data-[state=checked]:bg-success"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-semibold text-lg text-destructive">Danger</p>

        <p className="text-destructive text-sm font-semibold">
          Deleting a domain will stop sending emails with this domain.
        </p>
        <DeleteDomain domain={domain} />
      </div>
    </div>
  );
};

const DnsVerificationStatus: React.FC<{ status: DomainStatus }> = ({ status }) => {
  let badgeColor = "bg-gray/10 text-gray border-gray/10"; // Default color
  switch (status) {
    case DomainStatus.SUCCESS:
      badgeColor = "bg-green/15 text-green border border-green/25";
      break;
    case DomainStatus.FAILED:
      badgeColor = "bg-red/10 text-red border border-red/10";
      break;
    case DomainStatus.TEMPORARY_FAILURE:
    case DomainStatus.PENDING:
      badgeColor = "bg-yellow/20 text-yellow border border-yellow/10";
      break;
    default:
      badgeColor = "bg-gray/10 text-gray border border-gray/20";
  }

  return (
    <div
      className={` text-xs text-center min-w-[70px] capitalize rounded-md py-1 justify-center flex items-center ${badgeColor}`}
    >
      {status.split("_").join(" ").toLowerCase()}
    </div>
  );
};
