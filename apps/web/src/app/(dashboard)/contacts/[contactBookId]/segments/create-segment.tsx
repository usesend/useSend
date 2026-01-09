"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Label } from "@usesend/ui/src/label";
import { Spinner } from "@usesend/ui/src/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { toast } from "@usesend/ui/src/toaster";
import { Plus, Trash2 } from "lucide-react";

interface Filter {
  field: string;
  operator: string;
  value?: string | boolean;
  propertyKey?: string;
}

const FIELDS = [
  { value: "email", label: "Email" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "subscribed", label: "Subscribed" },
  { value: "createdAt", label: "Created Date" },
];

const OPERATORS: Record<string, Array<{ value: string; label: string }>> = {
  email: [
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "equals", label: "Equals" },
    { value: "ends_with", label: "Ends with" },
  ],
  firstName: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ],
  lastName: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "is_not_empty", label: "Is not empty" },
  ],
  subscribed: [
    { value: "is_true", label: "Is subscribed" },
    { value: "is_false", label: "Is unsubscribed" },
  ],
  createdAt: [
    { value: "greater_than", label: "After" },
    { value: "less_than", label: "Before" },
  ],
};

interface CreateSegmentProps {
  contactBookId: string;
}

export default function CreateSegment({ contactBookId }: CreateSegmentProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<Filter[]>([
    { field: "subscribed", operator: "is_true" },
  ]);

  const utils = api.useUtils();

  const createMutation = api.segment.create.useMutation({
    onSuccess: () => {
      toast.success("Segment created");
      utils.segment.list.invalidate({ contactBookId });
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const previewQuery = api.segment.preview.useQuery(
    { contactBookId, filters: filters as any, limit: 5 },
    { enabled: filters.length > 0 },
  );

  const resetForm = () => {
    setName("");
    setDescription("");
    setFilters([{ field: "subscribed", operator: "is_true" }]);
  };

  const addFilter = () => {
    setFilters([...filters, { field: "email", operator: "contains", value: "" }]);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<Filter>) => {
    setFilters(
      filters.map((f, i) => {
        if (i !== index) return f;
        const updated = { ...f, ...updates };
        // Reset operator when field changes
        if (updates.field && updates.field !== f.field) {
          const ops = OPERATORS[updates.field];
          updated.operator = ops?.[0]?.value ?? "equals";
          updated.value = "";
        }
        return updated;
      }),
    );
  };

  const needsValue = (operator: string) => {
    return !["is_true", "is_false", "is_empty", "is_not_empty"].includes(operator);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Please enter a segment name");
      return;
    }
    if (filters.length === 0) {
      toast.error("Please add at least one filter");
      return;
    }
    createMutation.mutate({
      contactBookId,
      name,
      description: description || undefined,
      filters: filters as any,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Segment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Segment</DialogTitle>
          <DialogDescription>
            Define filters to create a dynamic group of contacts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Active Subscribers"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Contacts who are subscribed and added this month"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Filters</Label>
              <Button variant="outline" size="sm" onClick={addFilter}>
                <Plus className="h-3 w-3 mr-1" />
                Add Filter
              </Button>
            </div>

            <div className="space-y-2">
              {filters.map((filter, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30"
                >
                  <Select
                    value={filter.field}
                    onValueChange={(v) => updateFilter(index, { field: v })}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filter.operator}
                    onValueChange={(v) => updateFilter(index, { operator: v })}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(OPERATORS[filter.field] ?? []).map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {needsValue(filter.operator) && (
                    <Input
                      value={String(filter.value ?? "")}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      placeholder="Value"
                      className="flex-1"
                      type={filter.field === "createdAt" ? "date" : "text"}
                    />
                  )}

                  {filters.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFilter(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="text-sm font-medium mb-2">
              Preview:{" "}
              {previewQuery.isLoading ? (
                <Spinner className="inline w-3 h-3" />
              ) : (
                <span className="font-mono">
                  {previewQuery.data?.total.toLocaleString() ?? 0} contacts
                </span>
              )}
            </div>
            {previewQuery.data && previewQuery.data.contacts.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-1">
                {previewQuery.data.contacts.slice(0, 3).map((c) => (
                  <div key={c.id}>{c.email}</div>
                ))}
                {previewQuery.data.total > 3 && (
                  <div>... and {previewQuery.data.total - 3} more</div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                Creating...
              </>
            ) : (
              "Create Segment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
