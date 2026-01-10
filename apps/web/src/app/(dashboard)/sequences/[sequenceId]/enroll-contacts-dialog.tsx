"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Checkbox } from "@usesend/ui/src/checkbox";
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
import { Spinner } from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { Search, Users } from "lucide-react";

interface EnrollContactsDialogProps {
  sequenceId: string;
  contactBookId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnrollContactsDialog({
  sequenceId,
  contactBookId,
  open,
  onOpenChange,
}: EnrollContactsDialogProps) {
  const utils = api.useUtils();

  const [selectedContactBookId, setSelectedContactBookId] = useState(
    contactBookId || ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set()
  );
  const [selectAll, setSelectAll] = useState(false);

  const contactBooksQuery = api.contacts.getContactBooks.useQuery();

  const contactsQuery = api.contacts.getContacts.useQuery(
    {
      contactBookId: selectedContactBookId,
      page: 1,
      search: searchQuery || undefined,
    },
    {
      enabled: !!selectedContactBookId,
    }
  );

  const enrollMutation = api.sequence.enrollContacts.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.enrolled} contacts enrolled`);
      utils.sequence.get.invalidate({ id: sequenceId });
      utils.sequence.getStats.invalidate({ sequenceId });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setSelectedContacts(new Set());
    setSelectAll(false);
    setSearchQuery("");
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked && contactsQuery.data) {
      setSelectedContacts(new Set(contactsQuery.data.contacts.map((c) => c.id)));
    } else {
      setSelectedContacts(new Set());
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    const newSelected = new Set(selectedContacts);
    if (checked) {
      newSelected.add(contactId);
    } else {
      newSelected.delete(contactId);
      setSelectAll(false);
    }
    setSelectedContacts(newSelected);
  };

  const handleEnroll = () => {
    if (selectedContacts.size === 0) {
      toast.error("Please select at least one contact");
      return;
    }

    enrollMutation.mutate({
      sequenceId,
      contactIds: Array.from(selectedContacts),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Enroll Contacts</DialogTitle>
          <DialogDescription>
            Select contacts to enroll in this automation sequence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Contact Book</label>
            <Select
              value={selectedContactBookId}
              onValueChange={(v) => {
                setSelectedContactBookId(v);
                setSelectedContacts(new Set());
                setSelectAll(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a contact book" />
              </SelectTrigger>
              <SelectContent>
                {contactBooksQuery.data?.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.emoji} {book.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedContactBookId && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="pl-9"
                />
              </div>

              <div className="border rounded-lg">
                <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm font-medium">
                    Select all ({contactsQuery.data?.contacts.length || 0}{" "}
                    contacts)
                  </span>
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  {contactsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner className="h-5 w-5" />
                    </div>
                  ) : contactsQuery.data?.contacts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No contacts found</p>
                    </div>
                  ) : (
                    contactsQuery.data?.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedContacts.has(contact.id)}
                          onCheckedChange={(checked) =>
                            handleSelectContact(contact.id, !!checked)
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {contact.email}
                          </p>
                          {(contact.firstName || contact.lastName) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[contact.firstName, contact.lastName]
                                .filter(Boolean)
                                .join(" ")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {selectedContacts.size} contact
                {selectedContacts.size !== 1 ? "s" : ""} selected
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleEnroll}
            disabled={
              enrollMutation.isPending || selectedContacts.size === 0
            }
            isLoading={enrollMutation.isPending}
          >
            Enroll {selectedContacts.size} Contact
            {selectedContacts.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
