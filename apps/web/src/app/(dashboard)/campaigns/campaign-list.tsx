"use client";

import { api } from "~/trpc/react";
import { useUrlState } from "~/hooks/useUrlState";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { CampaignStatus } from "@prisma/client";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@usesend/ui/src/select";
import { Input } from "@usesend/ui/src/input";
import { Search } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import CampaignCard from "./campaign-card";

export default function CampaignList() {
  const [page, setPage] = useUrlState("page", "1");
  const [status, setStatus] = useUrlState("status");
  const [searchTerm, setSearchTerm] = useUrlState("search");
  const [search, setSearch] = useUrlState("search");

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
  }, 1000);

  const onSearch = (value: string) => {
    setSearchTerm(value);
    debouncedSearch(value);
  };

  const pageNumber = Number(page);

  const campaignsQuery = api.campaign.getCampaigns.useQuery(
    {
      page: pageNumber,
      status: status as CampaignStatus | null,
      search,
    },
    {
      refetchInterval: (query) => {
        const c = query.state.data?.campaigns;
        if (!c) return false;
        const shouldPoll = c.some(
          (campaign) =>
            campaign.status === CampaignStatus.RUNNING ||
            campaign.status === CampaignStatus.SCHEDULED
        );
        return shouldPoll ? 5000 : false;
      },
    }
  );

  return (
    <div className="mt-10 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        {/* Search input */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search campaigns..."
            value={searchTerm || ""}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status filter */}
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
      {/* Campaign cards */}
      <div className="flex flex-col gap-8">
        {campaignsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="w-6 h-6" innerSvgClass="stroke-primary" />
          </div>
        ) : campaignsQuery.data?.campaigns.length ? (
          campaignsQuery.data?.campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No campaigns found
            {(search || status) && (
              <div className="text-sm mt-2">
                Try adjusting your search or filters
              </div>
            )}
          </div>
        )}
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
