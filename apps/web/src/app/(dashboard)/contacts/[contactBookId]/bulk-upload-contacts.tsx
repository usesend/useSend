"use client";

import { useState, useMemo } from "react";
import { api } from "~/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import { Button } from "@usesend/ui/src/button";
import { Label } from "@usesend/ui/src/label";
import { Textarea } from "@usesend/ui/src/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@usesend/ui/src/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import { Upload, FileText, Check, X } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";

interface BulkUploadContactsProps {
  contactBookId: string;
}

interface ParsedContact {
  email: string;
  firstName?: string;
  lastName?: string;
  subscribed?: boolean;
  isValid: boolean;
}

export default function BulkUploadContacts({
  contactBookId,
}: BulkUploadContactsProps) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const utils = api.useUtils();

  const addContactsMutation = api.contacts.addContacts.useMutation({
    onSuccess: (result) => {
      utils.contacts.contacts.invalidate();
      utils.contacts.getContactBookDetails.invalidate();
      setProcessing(false);
      handleClose();
      toast.success(result.message);
    },
    onError: (error) => {
      setError(error.message);
      setProcessing(false);
    },
  });

  const handleClose = () => {
    setInputText("");
    setError(null);
    setProcessing(false);
    setOpen(false);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const parseContactLine = (
    line: string,
    isFirstLine: boolean = false,
  ): {
    email: string;
    firstName?: string;
    lastName?: string;
    subscribed?: boolean;
  } | null => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return null;

    // Split by comma, handling quoted values
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < trimmedLine.length; i++) {
      const char = trimmedLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        parts.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    parts.push(current.trim());

    if (parts.length === 0 || !parts[0]) return null;

    // Check if this is a header row (case-insensitive)
    if (isFirstLine) {
      const firstPart = parts[0]?.toLowerCase();
      if (
        firstPart === "email" ||
        firstPart === "e-mail" ||
        firstPart === "email address"
      ) {
        return null; // Skip header row
      }
    }

    const email = parts[0]!.toLowerCase();

    // Skip if doesn't look like an email
    if (!email.includes("@")) return null;

    // Parse subscribed value (support CSV export format: Email, First Name, Last Name, Subscribed, ...)
    let subscribed: boolean | undefined = undefined;
    let firstName: string | undefined = undefined;
    let lastName: string | undefined = undefined;

    if (parts.length >= 4) {
      // Could be: email,firstName,lastName,subscribed
      firstName = parts[1] || undefined;
      lastName = parts[2] || undefined;
      const subscribedValue = parts[3]?.toLowerCase();
      if (subscribedValue === "yes" || subscribedValue === "true") {
        subscribed = true;
      } else if (subscribedValue === "no" || subscribedValue === "false") {
        subscribed = false;
      }
    } else if (parts.length === 3) {
      // email,firstName,lastName
      firstName = parts[1] || undefined;
      lastName = parts[2] || undefined;
    } else if (parts.length === 2) {
      // email,firstName
      firstName = parts[1] || undefined;
    }

    return {
      email,
      firstName,
      lastName,
      subscribed,
    };
  };

  const parseContacts = (text: string): ParsedContact[] => {
    const lines = text.split("\n");
    const contactsMap = new Map<string, ParsedContact>();

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseContactLine(lines[i]!, i === 0);
      if (parsed) {
        // Use email as key to deduplicate
        if (!contactsMap.has(parsed.email)) {
          contactsMap.set(parsed.email, {
            ...parsed,
            isValid: validateEmail(parsed.email),
          });
        }
      }
    }

    return Array.from(contactsMap.values());
  };

  const processFile = (file: File) => {
    // Validate file type
    if (!file.name.endsWith(".txt") && !file.name.endsWith(".csv")) {
      setError("Please upload a .txt or .csv file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setInputText(text);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0]) {
      processFile(files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProcessing(true);

    if (!inputText.trim()) {
      setError("Please enter contact information or upload a file");
      setProcessing(false);
      return;
    }

    const parsedContacts = parseContacts(inputText);

    if (parsedContacts.length === 0) {
      setError("No valid contacts found");
      setProcessing(false);
      return;
    }

    const validContacts = parsedContacts.filter((c) => c.isValid);

    if (validContacts.length === 0) {
      setError("No valid email addresses found");
      setProcessing(false);
      return;
    }

    if (validContacts.length > 50000) {
      setError("Maximum 50,000 contacts allowed per upload");
      setProcessing(false);
      return;
    }

    if (validContacts.length !== parsedContacts.length) {
      const invalidCount = parsedContacts.length - validContacts.length;
      setError(`${invalidCount} invalid entries will be skipped`);
      // Continue processing with valid contacts
    }

    try {
      await addContactsMutation.mutateAsync({
        contactBookId,
        contacts: validContacts.map((c) => ({
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          subscribed: c.subscribed,
        })),
      });
    } catch {
      setProcessing(false);
    }
  };

  const parsedContacts = useMemo(() => parseContacts(inputText), [inputText]);

  const validContacts = useMemo(
    () => parsedContacts.filter((c) => c.isValid),
    [parsedContacts],
  );

  const invalidCount = useMemo(
    () => parsedContacts.length - validContacts.length,
    [parsedContacts.length, validContacts.length],
  );

  const previewContacts = useMemo(
    () => parsedContacts.slice(0, 20),
    [parsedContacts],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-1" />
          Upload Contacts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Contacts</DialogTitle>
          <DialogDescription className="text-sm">
            Upload multiple contacts at once. Cannot change from unsubscribed to
            subscribed via upload
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">
                <Upload className="h-4 w-4 mr-2" />
                File Upload
              </TabsTrigger>
              <TabsTrigger value="text">
                <FileText className="h-4 w-4 mr-2" />
                Text Input
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contacts">Contacts</Label>
                <Textarea
                  id="contacts"
                  placeholder={`Enter contacts, one per line:

john@example.com,John,Doe,Yes
jane@example.com,Jane,Smith,No
bob@example.com

Format: email,firstName,lastName,subscribed (all fields except email are optional)`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                  disabled={processing}
                />
              </div>
            </TabsContent>

            <TabsContent value="file" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Upload File</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                    isDragOver
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    id="file"
                    type="file"
                    accept=".txt,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={processing}
                  />
                  <div className="text-center">
                    <Upload
                      className={`mx-auto h-12 w-12 ${
                        isDragOver ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("file")?.click()}
                        disabled={processing}
                      >
                        Choose File
                      </Button>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {isDragOver
                        ? "Drop your file here"
                        : "Upload a .txt or .csv file or drag and drop here"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Format: email,firstName,lastName,subscribed (one per line)
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Preview Table */}
          {previewContacts.length > 0 && (
            <div className="space-y-2">
              <Label>
                Preview (showing {previewContacts.length} of{" "}
                {parsedContacts.length})
              </Label>
              <div className="border rounded-lg max-h-[250px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Email</TableHead>
                      <TableHead>First Name</TableHead>
                      <TableHead>Last Name</TableHead>
                      <TableHead>Subscribed</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewContacts.map((contact, index) => (
                      <TableRow key={`${contact.email}-${index}`}>
                        <TableCell className="font-mono text-sm">
                          {contact.email}
                        </TableCell>
                        <TableCell className="text-sm">
                          {contact.firstName || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {contact.lastName || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {contact.subscribed === undefined ? (
                            <span className="text-muted-foreground">
                              Default
                            </span>
                          ) : contact.subscribed ? (
                            <span className="text-green">Yes</span>
                          ) : (
                            <span className="text-red">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.isValid ? (
                            <div className="flex items-center text-green">
                              <Check className="h-4 w-4 mr-1" />
                              <span className="text-xs">Valid</span>
                            </div>
                          ) : (
                            <div className="flex items-center text-red">
                              <X className="h-4 w-4 mr-1" />
                              <span className="text-xs">Invalid</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Summary counts */}
          {parsedContacts.length > 0 && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              <div className="flex gap-4">
                <span>Total: {parsedContacts.length}</span>
                <span className="text-green">
                  Valid: {validContacts.length}
                </span>
                {invalidCount > 0 && (
                  <span className="text-red">Invalid: {invalidCount}</span>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={processing || validContacts.length === 0}
            >
              {processing
                ? "Uploading..."
                : `Upload ${validContacts.length} Contacts`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
