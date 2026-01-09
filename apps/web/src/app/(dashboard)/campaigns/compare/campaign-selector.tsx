"use client";

import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
import { Badge } from "@usesend/ui/src/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { BarChart3, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import CampaignStatusBadge from "../campaign-status-badge";

interface CampaignSelectorProps {
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export default function CampaignSelector({
  selectedIds,
  onToggle,
}: CampaignSelectorProps) {
  const campaignsQuery = api.campaign.getComparisonCampaigns.useQuery();

  if (campaignsQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const campaigns = campaignsQuery.data ?? [];

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16 border rounded-xl bg-muted/30">
        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No campaigns to compare</h3>
        <p className="text-muted-foreground">
          You need completed or running campaigns with sent emails to compare.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedIds.length} of 5 selected
          {selectedIds.length >= 2 && " (minimum reached)"}
        </p>
        {selectedIds.length >= 5 && (
          <Badge variant="secondary">Maximum 5 campaigns</Badge>
        )}
      </div>

      <div className="flex flex-col rounded-xl border shadow">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted dark:bg-muted/70">
              <TableHead className="w-12 rounded-tl-xl"></TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right rounded-tr-xl">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => {
              const isSelected = selectedIds.includes(campaign.id);
              const isDisabled = !isSelected && selectedIds.length >= 5;

              return (
                <TableRow
                  key={campaign.id}
                  className={`cursor-pointer ${isDisabled ? "opacity-50" : ""} ${isSelected ? "bg-primary/5" : ""}`}
                  onClick={() => !isDisabled && onToggle(campaign.id)}
                >
                  <TableCell>
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{campaign.name}</div>
                      <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {campaign.subject}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <CampaignStatusBadge status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {(campaign.sent ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {(campaign.delivered ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDistanceToNow(campaign.createdAt, { addSuffix: true })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
