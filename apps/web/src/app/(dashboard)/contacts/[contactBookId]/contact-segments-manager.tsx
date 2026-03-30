"use client";

import { Badge } from "@usesend/ui/src/badge";
import { Button } from "@usesend/ui/src/button";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import { Input } from "@usesend/ui/src/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { Pencil, Plus, Trash2, Users2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  contactSegmentDefinitionSchema,
  contactSegmentOperatorRequiresValue,
  describeContactSegmentDefinition,
  type ContactSegmentCondition,
  type ContactSegmentDefinition,
  type ContactSegmentOperator,
} from "~/lib/contact-segments";
import { api } from "~/trpc/react";

const DEFAULT_OPERATOR: ContactSegmentOperator = "equals";

type SegmentEditorState = {
  id?: string;
  name: string;
  conditions: Array<ContactSegmentCondition & { id: string }>;
};

function createEmptyCondition(
  contactBookVariables: string[],
): ContactSegmentCondition & { id: string } {
  return {
    id: crypto.randomUUID(),
    field: contactBookVariables[0] ?? "",
    operator: DEFAULT_OPERATOR,
    value: "",
  };
}

function createEmptyState(contactBookVariables: string[]): SegmentEditorState {
  return {
    name: "",
    conditions: [createEmptyCondition(contactBookVariables)],
  };
}

export default function ContactSegmentsManager({
  contactBookId,
  contactBookVariables,
}: {
  contactBookId: string;
  contactBookVariables: string[];
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [editorState, setEditorState] = useState<SegmentEditorState>(() =>
    createEmptyState(contactBookVariables),
  );

  useEffect(() => {
    if (!open) {
      setEditorState(createEmptyState(contactBookVariables));
    }
  }, [contactBookVariables, open]);

  const segmentsQuery = api.contacts.listSegments.useQuery({ contactBookId });

  const invalidate = async () => {
    await Promise.all([
      utils.contacts.listSegments.invalidate({ contactBookId }),
      utils.contacts.contacts.invalidate({ contactBookId }),
      utils.contacts.exportContacts.invalidate({ contactBookId }),
      utils.contacts.getContactBookDetails.invalidate({ contactBookId }),
      utils.campaign.getCampaign.invalidate(),
      utils.campaign.getCampaignAudience.invalidate(),
    ]);
  };

  const createSegmentMutation = api.contacts.createSegment.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Segment created");
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateSegmentMutation = api.contacts.updateSegment.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Segment updated");
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteSegmentMutation = api.contacts.deleteSegment.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Segment deleted");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const saveSegment = () => {
    const definition: ContactSegmentDefinition = {
      conditions: editorState.conditions.map(({ field, operator, value }) => ({
        field,
        operator,
        ...(value ? { value } : {}),
      })),
    };

    const parsed = contactSegmentDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid segment");
      return;
    }

    if (editorState.id) {
      updateSegmentMutation.mutate({
        contactBookId,
        segmentId: editorState.id,
        name: editorState.name,
        definition: parsed.data,
      });
      return;
    }

    createSegmentMutation.mutate({
      contactBookId,
      name: editorState.name,
      definition: parsed.data,
    });
  };

  const upsertCondition = (
    conditionId: string,
    patch: Partial<ContactSegmentCondition>,
  ) => {
    setEditorState((current) => ({
      ...current,
      conditions: current.conditions.map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition,
      ),
    }));
  };

  if (contactBookVariables.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users2 className="h-4 w-4" />
            Segments
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Add custom variables on this contact book before creating segments.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users2 className="h-4 w-4" />
            Segments
          </CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setEditorState(createEmptyState(contactBookVariables));
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New segment
          </Button>
        </CardHeader>
        <CardContent>
          {segmentsQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="h-5 w-5" />
            </div>
          ) : segmentsQuery.data && segmentsQuery.data.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {segmentsQuery.data.map((segment) => (
                <div
                  key={segment.id}
                  className="rounded-lg border p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{segment.name}</div>
                        <Badge variant="outline">
                          {segment.count.toLocaleString()} contacts
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {describeContactSegmentDefinition(segment.filters)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditorState({
                            id: segment.id,
                            name: segment.name,
                            conditions: segment.filters.conditions.map(
                              (condition) => ({
                                ...condition,
                                id: crypto.randomUUID(),
                              }),
                            ),
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deleteSegmentMutation.isPending}
                        onClick={() => {
                          deleteSegmentMutation.mutate({
                            contactBookId,
                            segmentId: segment.id,
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No segments yet. Create one to target campaigns with a subset of
              this list.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editorState.id ? "Edit segment" : "Create segment"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Name</div>
              <Input
                value={editorState.name}
                onChange={(event) => {
                  setEditorState((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                }}
                placeholder="Paid users"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Conditions</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditorState((current) => ({
                      ...current,
                      conditions: [
                        ...current.conditions,
                        createEmptyCondition(contactBookVariables),
                      ],
                    }));
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add rule
                </Button>
              </div>

              {editorState.conditions.map((condition, index) => (
                <div
                  key={condition.id}
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1.3fr_1fr_1.2fr_auto]"
                >
                  <Select
                    value={condition.field}
                    onValueChange={(value) => {
                      upsertCondition(condition.id, { field: value });
                    }}
                  >
                    <SelectTrigger>
                      {condition.field || "Select field"}
                    </SelectTrigger>
                    <SelectContent>
                      {contactBookVariables.map((variable) => (
                        <SelectItem key={variable} value={variable}>
                          {variable}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={condition.operator}
                    onValueChange={(value) => {
                      const operator = value as ContactSegmentOperator;
                      upsertCondition(condition.id, {
                        operator,
                        value: contactSegmentOperatorRequiresValue(operator)
                          ? condition.value ?? ""
                          : "",
                      });
                    }}
                  >
                    <SelectTrigger>{condition.operator}</SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">equals</SelectItem>
                      <SelectItem value="contains">contains</SelectItem>
                      <SelectItem value="isSet">is set</SelectItem>
                      <SelectItem value="isNotSet">is not set</SelectItem>
                    </SelectContent>
                  </Select>

                  {contactSegmentOperatorRequiresValue(condition.operator) ? (
                    <Input
                      value={condition.value ?? ""}
                      onChange={(event) => {
                        upsertCondition(condition.id, {
                          value: event.target.value,
                        });
                      }}
                      placeholder="Value"
                    />
                  ) : (
                    <div className="flex items-center text-sm text-muted-foreground">
                      No value needed
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={editorState.conditions.length === 1}
                    onClick={() => {
                      setEditorState((current) => ({
                        ...current,
                        conditions: current.conditions.filter(
                          (entry) => entry.id !== condition.id,
                        ),
                      }));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="text-xs text-muted-foreground md:col-span-4">
                    Rule {index + 1}. All rules must match for a contact to be
                    included.
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveSegment}
              disabled={
                createSegmentMutation.isPending || updateSegmentMutation.isPending
              }
            >
              {createSegmentMutation.isPending || updateSegmentMutation.isPending
                ? "Saving..."
                : editorState.id
                  ? "Save changes"
                  : "Create segment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
