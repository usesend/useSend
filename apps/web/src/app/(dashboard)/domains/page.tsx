"use client";

import DomainsList from "./domain-list";
import AddDomain from "./add-domain";
import { H1 } from "@usesend/ui";

export default function DomainsPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Domains</H1>
        <AddDomain />
      </div>
      <DomainsList />
    </div>
  );
}
