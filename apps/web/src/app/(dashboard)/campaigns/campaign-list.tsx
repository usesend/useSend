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
import { useUrlState } from "~/hooks/useUrlState";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { formatDistanceToNow } from "date-fns";
import { CampaignStatus } from "@prisma/client";
import DeleteCampaign from "./delete-campaign";
import Link from "next/link";
import DuplicateCampaign from "./duplicate-campaign";
import TogglePauseCampaign from "./toggle-pause-campaign";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@usesend/ui/src/select";

export default function CampaignList() {
  const [page, setPage] = useUrlState("page", "1");
  const [status, setStatus] = useUrlState("status");

  const pageNumber = Number(page);

  const campaignsQuery = api.campaign.getCampaigns.useQuery({
    page: pageNumber,
    status: status as CampaignStatus | null,
  });

  return (
    <div className="mt-10 flex flex-col gap-4">
      <div className="flex justify-end">
        <Select
          value={status ?? "all"}
          onValueChange={(val) => setStatus(val === "all" ? null : val)}
        >
          <SelectTrigger className="w-[180px] capitalize">
            {status ? status.toLowerCase() : "All statuses"}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className=" capitalize">
              All statuses
            </SelectItem>
            <SelectItem value={CampaignStatus.DRAFT} className=" capitalize">
              Draft
            </SelectItem>
            <SelectItem
              value={CampaignStatus.SCHEDULED}
              className=" capitalize"
            >
              Scheduled
            </SelectItem>
            <SelectItem value={CampaignStatus.RUNNING} className=" capitalize">
              Running
            </SelectItem>
            <SelectItem value={CampaignStatus.PAUSED} className=" capitalize">
              Paused
            </SelectItem>
            <SelectItem value={CampaignStatus.SENT} className=" capitalize">
              Sent
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col rounded-xl border border-border shadow">
        <Table className="">
          <TableHeader className="">
            <TableRow className=" bg-muted/30">
              <TableHead className="rounded-tl-xl">Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="">Created At</TableHead>
              <TableHead className="rounded-tr-xl">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaignsQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={4} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : campaignsQuery.data?.campaigns.length ? (
              campaignsQuery.data?.campaigns.map((campaign) => (
                <TableRow key={campaign.id} className="">
                  <TableCell className="font-medium">
                    <Link
                      className="underline underline-offset-4 decoration-dashed text-foreground hover:text-foreground"
                      href={
                        campaign.status === CampaignStatus.DRAFT ||
                        campaign.status === CampaignStatus.SCHEDULED
                          ? `/campaigns/${campaign.id}/edit`
                          : `/campaigns/${campaign.id}`
                      }
                    >
                      {campaign.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div
                      className={`text-center w-[130px] rounded capitalize py-1 text-xs ${
                        campaign.status === CampaignStatus.DRAFT
                          ? "bg-gray/15 text-gray border border-gray/25"
                          : campaign.status === CampaignStatus.SENT
                            ? "bg-green/15 text-green border border-green/25"
                            : campaign.status === CampaignStatus.RUNNING
                              ? "bg-blue/15 text-blue border border-blue/25"
                              : campaign.status === CampaignStatus.PAUSED
                                ? "bg-orange/15 text-orange border border-orange/25"
                                : "bg-yellow/15 text-yellow border border-yellow/25"
                      }`}
                    >
                      {campaign.status.toLowerCase()}
                    </div>
                  </TableCell>
                  <TableCell className="">
                    {formatDistanceToNow(new Date(campaign.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 items-center">
                      {(campaign.status === CampaignStatus.SCHEDULED ||
                        campaign.status === CampaignStatus.RUNNING) && (
                        <TogglePauseCampaign campaign={campaign} />
                      )}
                      <DuplicateCampaign campaign={campaign} />
                      <DeleteCampaign campaign={campaign} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="h-32">
                <TableCell colSpan={4} className="text-center py-4">
                  No campaigns found
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
          disabled={pageNumber >= (campaignsQuery.data?.totalPage ?? 0)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
