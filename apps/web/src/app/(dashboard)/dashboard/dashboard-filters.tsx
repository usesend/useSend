import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@usesend/ui/src/tabs";
import { useUrlState } from "~/hooks/useUrlState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";

interface DashboardFiltersProps {
  days: string;
  setDays: (days: string) => void;
  domain: string | null;
  setDomain: (domain: string | null) => void;
}

export default function DashboardFilters({
  days,
  setDays,
  domain,
  setDomain,
}: DashboardFiltersProps) {
  const { data: domainsQuery } = api.domain.domains.useQuery();

  const handleDomain = (val: string) => {
    setDomain(val === "All Domains" ? null : val);
  };

  return (
    <div className="flex gap-3">
      <Select
        value={domain ?? "All Domains"}
        onValueChange={(val) => handleDomain(val)}
      >
        <SelectTrigger className="w-[180px]">
          {domain
            ? domainsQuery?.find((d) => d.id === Number(domain))?.name
            : "All Domains"}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All Domains" className="capitalize">
            All Domains
          </SelectItem>
          {domainsQuery &&
            domainsQuery.map((domain) => (
              <SelectItem key={domain.id} value={domain.id.toString()}>
                {domain.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Tabs value={days || "7"} onValueChange={(value) => setDays(value)}>
        <TabsList>
          <TabsTrigger value="7">7 Days</TabsTrigger>
          <TabsTrigger value="30">30 Days</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
