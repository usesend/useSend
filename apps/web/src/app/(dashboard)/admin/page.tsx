"use client";

import AddSesConfiguration from "./add-ses-configuration";
import SesConfigurations from "./ses-configurations";

export default function AdminSesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">SES Configurations</h2>
        <AddSesConfiguration />
      </div>
      <SesConfigurations />
    </div>
  );
}
