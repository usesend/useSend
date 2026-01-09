"use client";

import CampaignList from "./campaign-list";
import CreateCampaign from "./create-campaign";
import { H1 } from "@usesend/ui";
import { Button } from "@usesend/ui/src/button";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

export default function ContactsPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Campaigns</H1>
        <div className="flex gap-2">
          <Link href="/campaigns/compare">
            <Button variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              Compare
            </Button>
          </Link>
          <CreateCampaign />
        </div>
      </div>
      <CampaignList />
    </div>
  );
}
