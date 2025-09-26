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
  const previousStatusRef = useRef(domainQuery.data?.status);

  // Track verification completion
  useEffect(() => {
    const currentStatus = domainQuery.data?.status;
    const previousStatus = previousStatusRef.current;
    
    // If we went from PENDING/FAILED to SUCCESS, show success message
    if (previousStatus && previousStatus !== DomainStatus.SUCCESS && currentStatus === DomainStatus.SUCCESS) {
      toast.success("Domain verified successfully! 🎉");
    }
    
    // If we went from PENDING to FAILED, show error message
    if (previousStatus === DomainStatus.PENDING && currentStatus === DomainStatus.FAILED) {
      toast.error("Domain verification failed. Please check your DNS records and try again.");
    }
    
    // Update the ref for next comparison
    previousStatusRef.current = currentStatus;
  }, [domainQuery.data?.status]);

  const handleVerify = () => {
    toast.info("Starting domain verification...");
    verifyQuery.mutate(
      { id: Number(domainId) },
      {
        onSuccess: () => {
          toast.success("Verification started successfully");
        },
        onError: (error) => {
          toast.error(`Verification failed: ${error.message}`);
        },
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
                  status={domainQuery.data?.status || DomainStatus.NOT_STARTED}
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <Button 
                  variant="outline" 
                  onClick={handleVerify}
                  isLoading={verifyQuery.isPending || domainQuery.data?.isVerifying}
                  showSpinner={true}
                  disabled={verifyQuery.isPending}
                >
                  {verifyQuery.isPending
                    ? "Starting verification..."
                    : domainQuery.data?.isVerifying
                      ? "Checking DNS records..."
                      : domainQuery.data?.status === DomainStatus.SUCCESS
                        ? "Verified ✓ - Check again"
                        : domainQuery.data?.status === DomainStatus.FAILED
                          ? "Verification failed - Retry"
                          : "Verify domain"}
                </Button>
              </div>
              {domainQuery.data ? (
                <SendTestMail domain={domainQuery.data} />
              ) : null}
            </div>
          </div>

          {/* Verification Status Section */}
          {(domainQuery.data?.isVerifying || verifyQuery.isPending || domainQuery.data?.status === DomainStatus.FAILED) && (
            <div className="border rounded-lg p-4 shadow bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {(domainQuery.data?.isVerifying || verifyQuery.isPending) && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  )}
                  {domainQuery.data?.status === DomainStatus.FAILED && (
                    <div className="h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
                      <span className="text-white text-xs">✕</span>
                    </div>
                  )}
                </div>
                <div className="flex-grow">
                  <p className="font-medium">
                    {verifyQuery.isPending 
                      ? "Initializing verification process..."
                      : domainQuery.data?.isVerifying 
                        ? "Verifying DNS records..."
                        : domainQuery.data?.status === DomainStatus.FAILED
                          ? "Verification failed"
                          : "Checking domain status..."}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {verifyQuery.isPending 
                      ? "Please wait while we start the verification process."
                      : domainQuery.data?.isVerifying 
                        ? "This process may take a few minutes. DNS records are being checked automatically."
                        : domainQuery.data?.status === DomainStatus.FAILED
                          ? "Please check your DNS records and try again."
                          : "Monitoring domain verification status..."}
                  </p>
                </div>
              </div>
            </div>
          )}

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
  const utils = api.useUtils();

  const [clickTracking, setClickTracking] = React.useState(
    domain.clickTracking,
  );
  const [openTracking, setOpenTracking] = React.useState(domain.openTracking);

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
