"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@usesend/ui/src/breadcrumb";
import Link from "next/link";
import { H2 } from "@usesend/ui";

import Spinner from "@usesend/ui/src/spinner";
import { api } from "~/trpc/react";
import { use } from "react";
import { CampaignStatus } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import TogglePauseCampaign from "../toggle-pause-campaign";
import CampaignStatusBadge from "../../campaigns/campaign-status-badge";
import { Button } from "@usesend/ui/src/button";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import { EmailStatusBadge } from "../../emails/email-status-badge";
import { AnimatePresence, motion } from "framer-motion";

export default function CampaignDetailsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);

  const { data: campaign, isLoading } = api.campaign.getCampaign.useQuery(
    { campaignId: campaignId },
    {
      refetchInterval: (query) => {
        const c: any = query.state.data;
        if (!c) return false;

        if (
          c.status === CampaignStatus.RUNNING ||
          c.status === CampaignStatus.PAUSED
        ) {
          return 5000;
        }
        return false;
      },
    }
  );

  const { data: latestEmails, isLoading: latestEmailsLoading } =
    api.campaign.latestEmails.useQuery(
      { campaignId: campaignId },
      {
        refetchInterval: 5000,
      }
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="w-5 h-5 text-foreground" />
      </div>
    );
  }

  if (!campaign) {
    return <div>Campaign not found</div>;
  }

  const deliveredCount = campaign.delivered ?? 0;
  const openedCount = campaign.opened ?? 0;
  const clickedCount = campaign.clicked ?? 0;
  const unsubscribedCount = campaign.unsubscribed ?? 0;
  const deliveredDenominator = deliveredCount > 0 ? deliveredCount : 0;
  const percentageOfDelivered = (value: number) =>
    deliveredDenominator > 0 ? (value / deliveredDenominator) * 100 : 0;

  const statisticsRows = [
    {
      status: "delivered",
      count: deliveredCount,
      percentage: deliveredDenominator > 0 ? 100 : 0,
    },
    {
      status: "unsubscribed",
      count: unsubscribedCount,
      percentage: percentageOfDelivered(unsubscribedCount),
    },
    {
      status: "clicked",
      count: clickedCount,
      percentage: percentageOfDelivered(clickedCount),
    },
    {
      status: "opened",
      count: openedCount,
      percentage: percentageOfDelivered(openedCount),
    },
  ];

  const total = campaign.total ?? 0;
  const processed = campaign.sent ?? 0;

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/campaigns" className="text-lg">
                  Campaigns
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-lg" />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-lg ">
                <div className="flex items-center gap-2">
                  <div className="max-w-[300px] truncate">{campaign.name}</div>
                  <CampaignStatusBadge status={campaign.status} />
                </div>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {campaign.status === "SCHEDULED" ? (
          <Link href={`/campaigns/${campaign.id}/edit`}>
            <Button>Edit</Button>
          </Link>
        ) : (
          <TogglePauseCampaign campaign={campaign} mode="full" />
        )}
      </div>

      <div className="mt-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-sm font-mono">Statistics</CardTitle>
                {total > 0 ? (
                  <div className="text-sm text-muted-foreground font-mono">
                    {processed.toLocaleString()} of {total.toLocaleString()}{" "}
                    processed
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No recipients processed yet
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {statisticsRows.map((row, index) => (
                <div
                  key={row.status}
                  className={`flex items-center justify-between gap-4 px-0 pb-3 ${
                    index !== statisticsRows.length - 1
                      ? "border-b border-dashed border-border"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CampaignStatusIndicator status={row.status} />
                    <div>
                      <div className="text-sm capitalize">{row.status}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-mono">{row.count}</div>
                    {row.status !== "delivered" ? (
                      <div className="text-xs text-muted-foreground">
                        {row.percentage.toFixed(1)}% of delivered
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex gap-2">
              <CardTitle className="text-sm font-mono">Live activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-[300px] flex-col">
                {latestEmailsLoading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Spinner className="h-5 w-5 text-foreground" />
                  </div>
                ) : !latestEmails || latestEmails.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                      No recent user actions yet. This section updates
                      automatically.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 overflow-y-auto overscroll-y-contain pr-1 no-scrollbar">
                    <AnimatePresence initial={true}>
                      {latestEmails.map((email) => {
                        const recipients = email.to ?? [];
                        const primaryRecipient =
                          recipients.length > 0
                            ? recipients[0]
                            : "Unknown recipient";
                        const timestamp =
                          email.latestStatus === "SCHEDULED" &&
                          email.scheduledAt
                            ? new Date(email.scheduledAt)
                            : new Date(email.updatedAt ?? email.createdAt);
                        const relativeTime = formatDistanceToNow(timestamp, {
                          addSuffix: true,
                        });

                        return (
                          <motion.div
                            key={email.id}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0"
                          >
                            <div className="text-sm font-mono">
                              {primaryRecipient}
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <EmailStatusBadge status={email.latestStatus} />
                              <span className="whitespace-nowrap text-xs text-muted-foreground font-mono">
                                {relativeTime}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {campaign.html && (
        <div className=" rounded-lg  mt-16">
          <H2 className="mb-4">Email</H2>

          <div className="p-2 rounded-lg border shadow  flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-3 px-4 py-1">
              <div className=" flex text-sm">
                <div className="w-[70px] text-muted-foreground">Subject</div>
                <div> {campaign.subject}</div>
              </div>
              <div className="flex  text-sm">
                <div className="w-[70px] text-muted-foreground">From</div>
                <div> {campaign.from}</div>
              </div>
              <div className="flex  text-sm items-center">
                <div className="w-[70px] text-muted-foreground">Contact</div>
                <Link
                  href={`/contacts/${campaign.contactBookId}`}
                  target="_blank"
                >
                  <div className="bg-secondary p-0.5 px-2 rounded-md ">
                    {campaign.contactBook?.emoji} &nbsp;
                    {campaign.contactBook?.name}
                  </div>
                </Link>
              </div>
            </div>
            <div className=" dark:bg-slate-50 overflow-auto text-black rounded py-8 border-t">
              <div dangerouslySetInnerHTML={{ __html: campaign.html ?? "" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CampaignStatusIndicator: React.FC<{ status: string }> = ({ status }) => {
  let colorClass = "bg-gray";

  switch (status) {
    case "delivered":
      colorClass = "bg-green";
      break;
    case "bounced":
    case "unsubscribed":
      colorClass = "bg-red";
      break;
    case "clicked":
      colorClass = "bg-blue";
      break;
    case "opened":
      colorClass = "bg-purple";
      break;
    case "complained":
      colorClass = "bg-yellow";
      break;
    default:
      colorClass = "bg-gray";
  }

  return <div className={`h-2.5 w-2.5 rounded-[2px] ${colorClass}`} />;
};
