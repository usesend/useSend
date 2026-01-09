"use client";

import CreateReport from "./create-report";
import ReportsList from "./reports-list";

export default function ReportsPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-muted-foreground text-sm">
            Schedule automated email reports to be sent to your team.
          </p>
        </div>
        <CreateReport />
      </div>
      <ReportsList />
    </div>
  );
}
