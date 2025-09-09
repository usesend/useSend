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

export default function CampaignDetailsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);

  const { data: campaign, isLoading } = api.campaign.getCampaign.useQuery({
    campaignId: campaignId,
  });

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

  const statusCards = [
    {
      status: "delivered",
      count: campaign.delivered,
      percentage: 100,
    },
    {
      status: "unsubscribed",
      count: campaign.unsubscribed,
      percentage: (campaign.unsubscribed / campaign.delivered) * 100,
    },
    {
      status: "clicked",
      count: campaign.clicked,
      percentage: (campaign.clicked / campaign.delivered) * 100,
    },
    {
      status: "opened",
      count: campaign.opened,
      percentage: (campaign.opened / campaign.delivered) * 100,
    },
  ];

  return (
    <div className="container mx-auto">
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
              {campaign.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mt-10">
        <H2 className="mb-4"> Statistics</H2>
        <div className="flex  gap-4">
          {statusCards.map((card) => (
            <div
              key={card.status}
              className="h-[100px] w-1/4  bg-secondary/10 border rounded-lg shadow p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                {card.status !== "total" ? (
                  <CampaignStatusBadge status={card.status} />
                ) : null}
                <div className="capitalize">{card.status.toLowerCase()}</div>
              </div>
              <div className="flex justify-between items-end">
                <div className="text-foreground font-light text-2xl font-mono">
                  {card.count}
                </div>
                {card.status !== "total" ? (
                  <div className="text-sm pb-1">
                    {card.percentage.toFixed(1)}%
                  </div>
                ) : null}
              </div>
            </div>
          ))}
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

const CampaignStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let outsideColor = "bg-gray";
  let insideColor = "bg-gray/50";

  switch (status) {
    case "delivered":
      outsideColor = "bg-green/30";
      insideColor = "bg-green";
      break;
    case "bounced":
    case "unsubscribed":
      outsideColor = "bg-red/30";
      insideColor = "bg-red";
      break;
    case "clicked":
      outsideColor = "bg-blue/30";
      insideColor = "bg-blue";
      break;
    case "opened":
      outsideColor = "bg-purple/30";
      insideColor = "bg-purple";
      break;

    case "complained":
      outsideColor = "bg-yellow/30";
      insideColor = "bg-yellow";
      break;
    default:
      outsideColor = "bg-gray/40";
      insideColor = "bg-gray";
  }

  return (
    <div
      className={`flex justify-center items-center p-1.5 ${outsideColor} rounded-full`}
    >
      <div className={`h-2 w-2 rounded-full ${insideColor}`}></div>
    </div>
  );
};
