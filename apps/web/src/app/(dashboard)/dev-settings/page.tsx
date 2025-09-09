"use client";

import AddApiKey from "./api-keys/add-api-key";
import ApiList from "./api-keys/api-list";
import { H1 } from "@usesend/ui";

export default function ApiKeysPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>API Keys</H1>
        <AddApiKey />
      </div>
      <ApiList />
    </div>
  );
}
