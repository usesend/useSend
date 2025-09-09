"use client";

import AddSesConfiguration from "./add-ses-configuration";
import SesConfigurations from "./ses-configurations";
import { H1 } from "@usesend/ui";

export default function ApiKeysPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Admin</H1>
        <AddSesConfiguration />
      </div>
      <div className="mt-10">
        <p className="font-semibold mb-4">SES Configurations</p>
        <SesConfigurations />
      </div>
    </div>
  );
}
