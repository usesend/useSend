"use client";

import React from "react";
import { api } from "~/trpc/react";
import { Switch } from "@usesend/ui/src/switch";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@usesend/ui/src/dialog";
import { Label } from "@usesend/ui/src/label";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";
import { InboundEmailStatus } from "@prisma/client";

const InboundStatusBadge: React.FC<{ status: InboundEmailStatus }> = ({
  status,
}) => {
  const styles: Record<InboundEmailStatus, string> = {
    RECEIVED: "bg-blue/15 text-blue border border-blue/25",
    FORWARDING: "bg-yellow/20 text-yellow border border-yellow/10",
    FORWARDED: "bg-green/15 text-green border border-green/25",
    FAILED: "bg-red/10 text-red border border-red/10",
    NO_RULE: "bg-gray/10 text-gray border border-gray/20",
  };

  const labels: Record<InboundEmailStatus, string> = {
    RECEIVED: "received",
    FORWARDING: "forwarding",
    FORWARDED: "forwarded",
    FAILED: "failed",
    NO_RULE: "no rule",
  };

  return (
    <div
      className={`text-xs text-center min-w-[70px] capitalize rounded-md py-1 justify-center flex items-center ${styles[status]}`}
    >
      {labels[status]}
    </div>
  );
};

const ForwardingTab: React.FC<{
  domainId: number;
  domainName: string;
  domainRegion: string;
  domainStatus: string;
  inboundEnabled: boolean;
}> = ({ domainId, domainName, domainRegion, domainStatus, inboundEnabled }) => {
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [newSourceLocal, setNewSourceLocal] = React.useState("");
  const [newDestination, setNewDestination] = React.useState("");
  const [logExpanded, setLogExpanded] = React.useState(false);

  const utils = api.useUtils();

  const rulesQuery = api.forwarding.listRules.useQuery({ id: domainId });

  const inboundEmailsQuery = api.forwarding.listInboundEmails.useQuery(
    { id: domainId, limit: 20 },
    { enabled: logExpanded }
  );

  const enableInbound = api.forwarding.enableInbound.useMutation({
    onSuccess: () => {
      utils.domain.getDomain.invalidate({ id: domainId });
      toast.success("Inbound email receiving enabled");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const disableInbound = api.forwarding.disableInbound.useMutation({
    onSuccess: () => {
      utils.domain.getDomain.invalidate({ id: domainId });
      toast.success("Inbound email receiving disabled");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createRule = api.forwarding.createRule.useMutation({
    onSuccess: () => {
      utils.forwarding.listRules.invalidate({ id: domainId });
      setNewSourceLocal("");
      setNewDestination("");
      setAddDialogOpen(false);
      toast.success("Forwarding rule created");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateRule = api.forwarding.updateRule.useMutation({
    onSuccess: () => {
      utils.forwarding.listRules.invalidate({ id: domainId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteRule = api.forwarding.deleteRule.useMutation({
    onSuccess: () => {
      utils.forwarding.listRules.invalidate({ id: domainId });
      toast.success("Forwarding rule deleted");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const mxRecordValue = `inbound-smtp.${domainRegion}.amazonaws.com`;

  function handleInboundToggle(checked: boolean) {
    if (checked) {
      enableInbound.mutate({ id: domainId });
    } else {
      disableInbound.mutate({ id: domainId });
    }
  }

  function handleAddRule() {
    if (!newSourceLocal.trim() || !newDestination.trim()) return;
    createRule.mutate({
      id: domainId,
      sourceAddress: newSourceLocal.trim(),
      destinationAddress: newDestination.trim(),
    });
  }

  function handleToggleRule(ruleId: string, currentEnabled: boolean) {
    updateRule.mutate({ ruleId, enabled: !currentEnabled });
  }

  function handleDeleteRule(ruleId: string) {
    deleteRule.mutate({ ruleId });
  }

  function formatDate(date: Date | string) {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const isInboundToggleLoading =
    enableInbound.isPending || disableInbound.isPending;

  const rules = rulesQuery.data ?? [];
  const inboundEmails = inboundEmailsQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-8">
      {domainStatus !== "SUCCESS" && inboundEnabled && (
        <div className="border border-yellow/25 bg-yellow/10 rounded-lg p-4">
          <p className="text-yellow text-sm font-medium">
            Domain verification has failed. Inbound forwarding may not work
            until DNS is fixed or inbound is manually disabled.
          </p>
        </div>
      )}

      {/* Inbound toggle card */}
      <div className="border rounded-lg p-4 shadow">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-xl">Inbound email receiving</p>
            <p className="text-muted-foreground text-sm">
              Enable inbound email receiving to forward emails sent to this
              domain to other addresses.
            </p>
          </div>
          <Switch
            checked={inboundEnabled}
            onCheckedChange={handleInboundToggle}
            disabled={isInboundToggleLoading}
            className="data-[state=checked]:bg-success"
          />
        </div>

        {inboundEnabled ? (
          <div className="mt-6">
            <p className="font-semibold text-sm mb-2">
              Add this MX record to your DNS to receive inbound emails
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="rounded-tl-xl">Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>TTL</TableHead>
                  <TableHead className="rounded-tr-xl">Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>MX</TableCell>
                  <TableCell>
                    <TextWithCopyButton value={domainName} />
                  </TableCell>
                  <TableCell>
                    <TextWithCopyButton
                      value={mxRecordValue}
                      className="w-[200px] overflow-hidden text-ellipsis text-nowrap"
                    />
                  </TableCell>
                  <TableCell>Auto</TableCell>
                  <TableCell>10</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>

      {/* Forwarding rules */}
      <div className="border rounded-lg p-4 shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-xl">Forwarding rules</p>
            <p className="text-muted-foreground text-sm">
              Configure which addresses forward to where.
            </p>
          </div>
          <Button
            onClick={() => setAddDialogOpen(true)}
            disabled={!inboundEnabled}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add rule
          </Button>
        </div>

        {rulesQuery.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Loading rules...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">
              No forwarding rules yet. Create one to start forwarding emails.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="rounded-tl-xl">Source address</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="rounded-tr-xl text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">
                    {rule.sourceAddress}@{domainName}
                  </TableCell>
                  <TableCell>{rule.destinationAddress}</TableCell>
                  <TableCell>
                    <div
                      className={`text-xs text-center min-w-[70px] capitalize rounded-md py-1 justify-center flex items-center ${
                        rule.enabled
                          ? "bg-green/15 text-green border border-green/25"
                          : "bg-gray/10 text-gray border border-gray/20"
                      }`}
                    >
                      {rule.enabled ? "active" : "paused"}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(rule.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() =>
                          handleToggleRule(rule.id, rule.enabled)
                        }
                        className="data-[state=checked]:bg-success scale-75"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Inbound email log */}
      <div className="border rounded-lg shadow">
        <button
          className="flex items-center justify-between w-full p-4 text-left"
          onClick={() => setLogExpanded(!logExpanded)}
        >
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-xl">Inbound email log</p>
            <p className="text-muted-foreground text-sm">
              Recent emails received on this domain.
            </p>
          </div>
          {logExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {logExpanded ? (
          <div className="px-4 pb-4">
            {inboundEmailsQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Loading...</p>
              </div>
            ) : inboundEmails.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No inbound emails received yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="rounded-tl-xl">From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="rounded-tr-xl">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inboundEmails.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell className="font-medium">
                        {email.from}
                      </TableCell>
                      <TableCell>{email.to}</TableCell>
                      <TableCell className="max-w-[250px] truncate">
                        {email.subject ?? "(no subject)"}
                      </TableCell>
                      <TableCell>
                        <InboundStatusBadge status={email.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(email.receivedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}
      </div>

      {/* Add rule dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add forwarding rule</DialogTitle>
            <DialogDescription>
              Forward emails from an address on {domainName} to another email
              address.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>Source address</Label>
              <div className="flex items-center gap-0">
                <Input
                  placeholder="support"
                  value={newSourceLocal}
                  onChange={(e) => setNewSourceLocal(e.target.value)}
                  className="rounded-r-none"
                />
                <div className="flex h-10 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                  @{domainName}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Destination address</Label>
              <Input
                type="email"
                placeholder="team@company.com"
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddRule}
              disabled={
                !newSourceLocal.trim() ||
                !newDestination.trim() ||
                createRule.isPending
              }
            >
              {createRule.isPending ? "Adding..." : "Add rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ForwardingTab;
