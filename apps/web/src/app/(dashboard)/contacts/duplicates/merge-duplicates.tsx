"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
import { Button } from "@usesend/ui/src/button";
import { Badge } from "@usesend/ui/src/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import { RadioGroup, RadioGroupItem } from "@usesend/ui/src/radio-group";
import { Label } from "@usesend/ui/src/label";
import { toast } from "@usesend/ui/src/toaster";
import { formatDistanceToNow } from "date-fns";
import { Check, Trash2 } from "lucide-react";

interface MergeDuplicatesProps {
  email: string;
  onClose: () => void;
}

export default function MergeDuplicates({ email, onClose }: MergeDuplicatesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const utils = api.useUtils();

  const detailsQuery = api.contacts.getDuplicateDetails.useQuery({ email });
  const mergeMutation = api.contacts.mergeDuplicates.useMutation({
    onSuccess: (data) => {
      toast.success(`Merged ${data.deleted} duplicate contacts`);
      utils.contacts.findDuplicates.invalidate();
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const contacts = detailsQuery.data ?? [];
  const deleteIds = contacts
    .filter((c) => c.id !== selectedId)
    .map((c) => c.id);

  const handleMerge = () => {
    if (!selectedId || deleteIds.length === 0) return;
    mergeMutation.mutate({
      email,
      keepContactId: selectedId,
      deleteContactIds: deleteIds,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Duplicate: {email}</DialogTitle>
          <DialogDescription>
            This email appears in {contacts.length} contact books. Select which
            contact to keep and the others will be deleted.
          </DialogDescription>
        </DialogHeader>

        {detailsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="w-6 h-6" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            <RadioGroup value={selectedId ?? ""} onValueChange={setSelectedId}>
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className={`flex items-start gap-3 p-4 border rounded-lg transition-colors ${
                    selectedId === contact.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={contact.id} id={contact.id} className="mt-1" />
                  <Label htmlFor={contact.id} className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{contact.contactBook.emoji}</span>
                        <span className="font-medium">{contact.contactBook.name}</span>
                      </div>
                      {selectedId === contact.id ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <Check className="h-3 w-3 mr-1" />
                          Keep
                        </Badge>
                      ) : selectedId ? (
                        <Badge variant="destructive" className="opacity-70">
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Badge>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Name:</span>{" "}
                        {contact.firstName || contact.lastName
                          ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
                          : "-"}
                      </div>
                      <div>
                        <span className="font-medium">Status:</span>{" "}
                        <Badge
                          variant={contact.subscribed ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {contact.subscribed ? "Subscribed" : "Unsubscribed"}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium">Added:</span>{" "}
                        {formatDistanceToNow(contact.createdAt, { addSuffix: true })}
                      </div>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!selectedId || mergeMutation.isPending}
          >
            {mergeMutation.isPending ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                Merging...
              </>
            ) : (
              `Keep 1, Delete ${deleteIds.length}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
