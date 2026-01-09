"use client";

import { useState } from "react";
import { H1 } from "@usesend/ui";
import { Button } from "@usesend/ui/src/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import CampaignSelector from "./campaign-selector";
import ComparisonView from "./comparison-view";

export default function CompareCampaignsPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleClear = () => {
    setSelectedIds([]);
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/campaigns">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <H1>Compare Campaigns</H1>
          <p className="text-sm text-muted-foreground mt-1">
            Select 2-5 campaigns to compare their performance metrics
          </p>
        </div>
      </div>

      {selectedIds.length < 2 ? (
        <CampaignSelector
          selectedIds={selectedIds}
          onToggle={handleToggle}
        />
      ) : (
        <ComparisonView
          selectedIds={selectedIds}
          onBack={handleClear}
          onRemove={(id) => setSelectedIds((prev) => prev.filter((i) => i !== id))}
        />
      )}
    </div>
  );
}
