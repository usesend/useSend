"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Textarea } from "@usesend/ui/src/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { toast } from "@usesend/ui/src/toaster";
import { SequenceTriggerType } from "@prisma/client";

const TRIGGER_DESCRIPTIONS: Record<SequenceTriggerType, string> = {
  MANUAL: "Manually enroll contacts into this sequence",
  CONTACT_CREATED: "Automatically enroll when a contact is added",
  TAG_ADDED: "Automatically enroll when a tag is added to a contact",
  FORM_SUBMITTED: "Automatically enroll when a form is submitted",
  CAMPAIGN_CLICKED: "Automatically enroll when a campaign link is clicked",
  CAMPAIGN_OPENED: "Automatically enroll when a campaign is opened",
};

interface CreateSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSequenceDialog({
  open,
  onOpenChange,
}: CreateSequenceDialogProps) {
  const router = useRouter();
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] =
    useState<SequenceTriggerType>("MANUAL");
  const [contactBookId, setContactBookId] = useState<string | undefined>();

  const contactBooksQuery = api.contacts.getContactBooks.useQuery();

  const createMutation = api.sequence.create.useMutation({
    onSuccess: (data) => {
      toast.success("Sequence created");
      utils.sequence.list.invalidate();
      onOpenChange(false);
      router.push(`/sequences/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Please enter a sequence name");
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      triggerType,
      contactBookId,
    });
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setTriggerType("MANUAL");
    setContactBookId(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Sequence</DialogTitle>
          <DialogDescription>
            Set up an automated email sequence to nurture your contacts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Welcome Series"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Introduce new subscribers to our product..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Trigger</label>
            <Select
              value={triggerType}
              onValueChange={(v) => setTriggerType(v as SequenceTriggerType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SequenceTriggerType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {TRIGGER_DESCRIPTIONS[triggerType]}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Contact Book (optional)
            </label>
            <Select
              value={contactBookId || "none"}
              onValueChange={(v) =>
                setContactBookId(v === "none" ? undefined : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a contact book" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No contact book</SelectItem>
                {contactBooksQuery.data?.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.emoji} {book.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Limit this sequence to contacts from a specific book
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            isLoading={createMutation.isPending}
          >
            Create Sequence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
