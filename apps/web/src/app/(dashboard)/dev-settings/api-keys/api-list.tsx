"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { formatDistanceToNow } from "date-fns";
import { api } from "~/trpc/react";
import DeleteApiKey from "./delete-api-key";
import Spinner from "@usesend/ui/src/spinner";

export default function ApiList() {
  const apiKeysQuery = api.apiKey.getApiKeys.useQuery();

  return (
    <div className="mt-10">
      <div className="border rounded-xl shadow">
        <Table className="">
          <TableHeader className="">
            <TableRow className=" bg-muted/30">
              <TableHead className="rounded-tl-xl">Name</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Permission</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created at</TableHead>
              <TableHead className="rounded-tr-xl">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeysQuery.isLoading ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4">
                  <Spinner
                    className="w-6 h-6 mx-auto"
                    innerSvgClass="stroke-primary"
                  />
                </TableCell>
              </TableRow>
            ) : apiKeysQuery.data?.length === 0 ? (
              <TableRow className="h-32">
                <TableCell colSpan={6} className="text-center py-4">
                  <p>No API keys added</p>
                </TableCell>
              </TableRow>
            ) : (
              apiKeysQuery.data?.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>{apiKey.name}</TableCell>
                  <TableCell>{apiKey.partialToken}</TableCell>
                  <TableCell>{apiKey.permission}</TableCell>
                  <TableCell>
                    {apiKey.lastUsed
                      ? formatDistanceToNow(apiKey.lastUsed)
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(apiKey.createdAt, { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <DeleteApiKey apiKey={apiKey} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
