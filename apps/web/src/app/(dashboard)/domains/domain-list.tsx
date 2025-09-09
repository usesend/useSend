"use client";

import { Domain } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Switch } from "@usesend/ui/src/switch";
import { api } from "~/trpc/react";
import React from "react";
import { StatusIndicator } from "./status-indicator";
import { DomainStatusBadge } from "./domain-badge";
import Spinner from "@usesend/ui/src/spinner";

export default function DomainsList() {
  const domainsQuery = api.domain.domains.useQuery();

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-6">
        {domainsQuery.isLoading ? (
          <div className="flex justify-center mt-10">
            <Spinner
              className="w-6 h-6 mx-auto"
              innerSvgClass="stroke-primary"
            />
          </div>
        ) : domainsQuery.data?.length ? (
          domainsQuery.data?.map((domain) => (
            <DomainItem key={domain.id} domain={domain} />
          ))
        ) : (
          <div className="text-center mt-20">No domains Added</div>
        )}
      </div>
    </div>
  );
}

const DomainItem: React.FC<{ domain: Domain }> = ({ domain }) => {
  const updateDomain = api.domain.updateDomain.useMutation();
  const utils = api.useUtils();

  const [clickTracking, setClickTracking] = React.useState(
    domain.clickTracking
  );
  const [openTracking, setOpenTracking] = React.useState(domain.openTracking);

  function handleClickTrackingChange() {
    setClickTracking(!clickTracking);
    updateDomain.mutate(
      { id: domain.id, clickTracking: !clickTracking },
      {
        onSuccess: () => {
          utils.domain.domains.invalidate();
        },
      }
    );
  }

  function handleOpenTrackingChange() {
    setOpenTracking(!openTracking);
    updateDomain.mutate(
      { id: domain.id, openTracking: !openTracking },
      {
        onSuccess: () => {
          utils.domain.domains.invalidate();
        },
      }
    );
  }

  return (
    <div key={domain.id}>
      <div className=" pr-8 border rounded-lg flex items-stretch shadow">
        <StatusIndicator status={domain.status} />
        <div className="flex justify-between w-full pl-8 py-4">
          <div className="flex flex-col gap-4 w-1/5">
            <Link
              href={`/domains/${domain.id}`}
              className="text-lg font-medium underline underline-offset-4 decoration-dashed"
            >
              {domain.name}
            </Link>
            <DomainStatusBadge status={domain.status} />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Created at</p>
              <p className="text-sm">
                {formatDistanceToNow(new Date(domain.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Region</p>

              <p className="text-sm flex items-center gap-2">{domain.region}</p>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex gap-2 items-center">
              <p className="text-sm">Click tracking</p>
              <Switch
                checked={clickTracking}
                onCheckedChange={handleClickTrackingChange}
                className="data-[state=checked]:bg-success"
              />
            </div>
            <div className="flex gap-2 items-center">
              <p className="text-sm">Open tracking</p>
              <Switch
                checked={openTracking}
                onCheckedChange={handleOpenTrackingChange}
                className="data-[state=checked]:bg-success"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
