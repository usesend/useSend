"use client";

import CampaignList from "./campaign-list";
import CreateCampaign from "./create-campaign";
import { H1 } from "@usesend/ui";

export default function ContactsPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Campaigns</H1>
        <CreateCampaign />
      </div>
      <CampaignList />
    </div>
  );
}
