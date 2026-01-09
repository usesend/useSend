"use client";

import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
import { Button } from "@usesend/ui/src/button";
import { Badge } from "@usesend/ui/src/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import { ArrowLeft, X } from "lucide-react";
import { format } from "date-fns";
import CampaignStatusBadge from "../campaign-status-badge";

interface ComparisonViewProps {
  selectedIds: string[];
  onBack: () => void;
  onRemove: (id: string) => void;
}

const metricLabels: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  unsubscribed: "Unsubscribed",
  deliveryRate: "Delivery Rate",
  openRate: "Open Rate",
  clickRate: "Click Rate",
  unsubscribeRate: "Unsubscribe Rate",
};

const metricColors: Record<string, string> = {
  sent: "bg-slate-500",
  delivered: "bg-green-500",
  opened: "bg-purple-500",
  clicked: "bg-blue-500",
  unsubscribed: "bg-red-500",
  deliveryRate: "bg-green-500",
  openRate: "bg-purple-500",
  clickRate: "bg-blue-500",
  unsubscribeRate: "bg-red-500",
};

export default function ComparisonView({
  selectedIds,
  onBack,
  onRemove,
}: ComparisonViewProps) {
  const comparisonQuery = api.campaign.compareCampaigns.useQuery({
    campaignIds: selectedIds,
  });

  if (comparisonQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const campaigns = comparisonQuery.data ?? [];

  // Find max values for each metric to highlight winners
  const maxValues = {
    delivered: Math.max(...campaigns.map((c) => c.delivered ?? 0)),
    openRate: Math.max(...campaigns.map((c) => c.openRate)),
    clickRate: Math.max(...campaigns.map((c) => c.clickRate)),
    deliveryRate: Math.max(...campaigns.map((c) => c.deliveryRate)),
  };

  const countMetrics = ["sent", "delivered", "opened", "clicked", "unsubscribed"] as const;
  const rateMetrics = ["deliveryRate", "openRate", "clickRate", "unsubscribeRate"] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Select different campaigns
        </Button>
        <p className="text-sm text-muted-foreground">
          Comparing {campaigns.length} campaigns
        </p>
      </div>

      {/* Campaign Headers */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${campaigns.length}, 1fr)` }}>
        {campaigns.map((campaign) => (
          <Card key={campaign.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1 pr-2">
                  <CardTitle className="text-base leading-tight">{campaign.name}</CardTitle>
                  <p className="text-sm text-muted-foreground truncate">
                    {campaign.subject}
                  </p>
                </div>
                {campaigns.length > 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => onRemove(campaign.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2 text-xs">
                <CampaignStatusBadge status={campaign.status} />
                {campaign.contactBook && (
                  <Badge variant="outline">
                    {campaign.contactBook.emoji} {campaign.contactBook.name}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {format(campaign.createdAt, "MMM d, yyyy")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Count Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volume Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {countMetrics.map((metric) => (
              <div key={metric}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{metricLabels[metric]}</span>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${campaigns.length}, 1fr)` }}>
                  {campaigns.map((campaign) => {
                    const value = campaign[metric] ?? 0;
                    const maxValue = Math.max(...campaigns.map((c) => c[metric] ?? 0));
                    const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
                    const isWinner = value === maxValue && maxValue > 0;

                    return (
                      <div key={campaign.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-lg ${isWinner ? "font-bold" : ""}`}>
                            {value.toLocaleString()}
                          </span>
                          {isWinner && maxValue > 0 && (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                              Best
                            </Badge>
                          )}
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${metricColors[metric]} transition-all`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rate Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {rateMetrics.map((metric) => (
              <div key={metric}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{metricLabels[metric]}</span>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${campaigns.length}, 1fr)` }}>
                  {campaigns.map((campaign) => {
                    const value = campaign[metric];
                    const maxValue = Math.max(...campaigns.map((c) => c[metric]));
                    const isWinner = value === maxValue && maxValue > 0;
                    // For unsubscribe rate, lower is better
                    const isBestUnsubscribe =
                      metric === "unsubscribeRate" &&
                      value === Math.min(...campaigns.map((c) => c[metric]));

                    return (
                      <div key={campaign.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-lg ${(isWinner && metric !== "unsubscribeRate") || isBestUnsubscribe ? "font-bold" : ""}`}>
                            {value.toFixed(1)}%
                          </span>
                          {metric !== "unsubscribeRate" && isWinner && maxValue > 0 && (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                              Best
                            </Badge>
                          )}
                          {isBestUnsubscribe && campaigns.some((c) => c[metric] !== value) && (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                              Best
                            </Badge>
                          )}
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${metricColors[metric]} transition-all`}
                            style={{ width: `${Math.min(value, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
