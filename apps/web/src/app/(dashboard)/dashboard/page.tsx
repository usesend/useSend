"use client";

import EmailChart from "./email-chart";
import DashboardFilters from "./dashboard-filters";
import { H1 } from "@usesend/ui";
import { useUrlState } from "~/hooks/useUrlState";
import { ReputationMetrics } from "./reputation-metrics";

export default function Dashboard() {
  const [days, setDays] = useUrlState("days", "7");
  const [domain, setDomain] = useUrlState("domain");

  return (
    <div>
      <div className="w-full">
        <div className="flex justify-between items-center mb-10">
          <H1>Analytics</H1>
          <DashboardFilters
            days={days ?? "7"}
            setDays={setDays}
            domain={domain}
            setDomain={setDomain}
          />
        </div>
        <div className=" space-y-12">
          <EmailChart days={Number(days ?? "7")} domain={domain} />

          <ReputationMetrics days={Number(days ?? "7")} domain={domain} />
        </div>
      </div>
    </div>
  );
}
