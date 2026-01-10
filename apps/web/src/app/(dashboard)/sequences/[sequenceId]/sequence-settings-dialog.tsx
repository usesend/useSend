"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Textarea } from "@usesend/ui/src/textarea";
import { Switch } from "@usesend/ui/src/switch";
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

interface SequenceSettingsDialogProps {
  sequence: {
    id: string;
    name: string;
    description: string | null;
    triggerType: SequenceTriggerType;
    contactBookId: string | null;
    fromEmail: string | null;
    fromName: string | null;
    replyTo: string | null;
    exitOnUnsubscribe: boolean;
    exitOnGoal: boolean;
    allowReentry: boolean;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SequenceSettingsDialog({
  sequence,
  open,
  onOpenChange,
}: SequenceSettingsDialogProps) {
  const utils = api.useUtils();

  const [name, setName] = useState(sequence.name);
  const [description, setDescription] = useState(sequence.description || "");
  const [triggerType, setTriggerType] = useState(sequence.triggerType);
  const [contactBookId, setContactBookId] = useState(
    sequence.contactBookId || ""
  );
  const [fromEmail, setFromEmail] = useState(sequence.fromEmail || "");
  const [fromName, setFromName] = useState(sequence.fromName || "");
  const [replyTo, setReplyTo] = useState(sequence.replyTo || "");
  const [exitOnUnsubscribe, setExitOnUnsubscribe] = useState(
    sequence.exitOnUnsubscribe
  );
  const [exitOnGoal, setExitOnGoal] = useState(sequence.exitOnGoal);
  const [allowReentry, setAllowReentry] = useState(sequence.allowReentry);

  const contactBooksQuery = api.contacts.getContactBooks.useQuery();
  const domainsQuery = api.domain.getDomains.useQuery();

  const updateMutation = api.sequence.update.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.sequence.get.invalidate({ id: sequence.id });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (open) {
      setName(sequence.name);
      setDescription(sequence.description || "");
      setTriggerType(sequence.triggerType);
      setContactBookId(sequence.contactBookId || "");
      setFromEmail(sequence.fromEmail || "");
      setFromName(sequence.fromName || "");
      setReplyTo(sequence.replyTo || "");
      setExitOnUnsubscribe(sequence.exitOnUnsubscribe);
      setExitOnGoal(sequence.exitOnGoal);
      setAllowReentry(sequence.allowReentry);
    }
  }, [open, sequence]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    updateMutation.mutate({
      id: sequence.id,
      name: name.trim(),
      description: description.trim() || undefined,
      triggerType,
      contactBookId: contactBookId || null,
      fromEmail: fromEmail.trim() || undefined,
      fromName: fromName.trim() || undefined,
      replyTo: replyTo.trim() || undefined,
      exitOnUnsubscribe,
      exitOnGoal,
      allowReentry,
    });
  };

  // Get verified sending addresses
  const verifiedAddresses = domainsQuery.data
    ?.filter((d) => d.isVerified)
    .map((d) => d.sendingEmail)
    .filter(Boolean) as string[] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sequence Settings</DialogTitle>
          <DialogDescription>
            Configure your automation sequence settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-medium">Basic Information</h3>

            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Welcome Series"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the purpose of this sequence..."
                rows={2}
              />
            </div>
          </div>

          {/* Trigger Settings */}
          <div className="space-y-4">
            <h3 className="font-medium">Trigger</h3>

            <div className="space-y-2">
              <label className="text-sm font-medium">Trigger Type</label>
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Book</label>
              <Select
                value={contactBookId || "none"}
                onValueChange={(v) => setContactBookId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact book" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any contact book</SelectItem>
                  {contactBooksQuery.data?.map((book) => (
                    <SelectItem key={book.id} value={book.id}>
                      {book.emoji} {book.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sender Settings */}
          <div className="space-y-4">
            <h3 className="font-medium">Sender</h3>

            <div className="space-y-2">
              <label className="text-sm font-medium">From Email</label>
              <Select
                value={fromEmail || "none"}
                onValueChange={(v) => setFromEmail(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sending email" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select an email</SelectItem>
                  {verifiedAddresses.map((email) => (
                    <SelectItem key={email} value={email}>
                      {email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">From Name</label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Your Company"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reply-To (optional)</label>
              <Input
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="support@example.com"
              />
            </div>
          </div>

          {/* Behavior Settings */}
          <div className="space-y-4">
            <h3 className="font-medium">Behavior</h3>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Exit on Unsubscribe</label>
                <p className="text-xs text-muted-foreground">
                  Remove contacts from sequence when they unsubscribe
                </p>
              </div>
              <Switch
                checked={exitOnUnsubscribe}
                onCheckedChange={setExitOnUnsubscribe}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Exit on Goal</label>
                <p className="text-xs text-muted-foreground">
                  Remove contacts when they reach a goal step
                </p>
              </div>
              <Switch checked={exitOnGoal} onCheckedChange={setExitOnGoal} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Allow Re-entry</label>
                <p className="text-xs text-muted-foreground">
                  Allow contacts to be enrolled multiple times
                </p>
              </div>
              <Switch
                checked={allowReentry}
                onCheckedChange={setAllowReentry}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            isLoading={updateMutation.isPending}
          >
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
