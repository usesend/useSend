"use client";

import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";

import { api } from "~/trpc/react";
import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, X } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";

interface ParsedContact {
  email: string;
  firstName?: string;
  lastName?: string;
}

interface ParseError {
  row: number;
  message: string;
}

function parseCSV(content: string): {
  contacts: ParsedContact[];
  errors: ParseError[];
} {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { contacts: [], errors: [{ row: 0, message: "File is empty" }] };
  }

  const headerLine = lines[0]!;
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());

  // Find column indices
  const emailIndex = headers.findIndex(
    (h) => h === "email" || h === "e-mail" || h === "email address"
  );
  const firstNameIndex = headers.findIndex(
    (h) =>
      h === "firstname" ||
      h === "first name" ||
      h === "first_name" ||
      h === "fname"
  );
  const lastNameIndex = headers.findIndex(
    (h) =>
      h === "lastname" ||
      h === "last name" ||
      h === "last_name" ||
      h === "lname"
  );

  if (emailIndex === -1) {
    return {
      contacts: [],
      errors: [
        {
          row: 1,
          message:
            'No "email" column found. Please ensure your CSV has an "email" header.',
        },
      ],
    };
  }

  const contacts: ParsedContact[] = [];
  const errors: ParseError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;

    // Handle CSV with quoted fields
    const values = parseCSVLine(line);
    const email = values[emailIndex]?.trim();

    if (!email) {
      errors.push({ row: i + 1, message: "Missing email" });
      continue;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({ row: i + 1, message: `Invalid email: ${email}` });
      continue;
    }

    const contact: ParsedContact = { email };

    if (firstNameIndex !== -1 && values[firstNameIndex]?.trim()) {
      contact.firstName = values[firstNameIndex]!.trim();
    }

    if (lastNameIndex !== -1 && values[lastNameIndex]?.trim()) {
      contact.lastName = values[lastNameIndex]!.trim();
    }

    contacts.push(contact);
  }

  return { contacts, errors };
}

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export default function UploadCSV({
  contactBookId,
}: {
  contactBookId: string;
}) {
  const [open, setOpen] = useState(false);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addContactsMutation = api.contacts.addContacts.useMutation();
  const utils = api.useUtils();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const { contacts, errors } = parseCSV(content);
      setParsedContacts(contacts);
      setParseErrors(errors);
    };
    reader.readAsText(file);
  };

  const handleClearFile = () => {
    setParsedContacts([]);
    setParseErrors([]);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = () => {
    if (parsedContacts.length === 0) {
      toast.error("No valid contacts to upload");
      return;
    }

    addContactsMutation.mutate(
      {
        contactBookId,
        contacts: parsedContacts,
      },
      {
        onSuccess: async () => {
          utils.contacts.contacts.invalidate();
          utils.contacts.getContactBookDetails.invalidate();
          setOpen(false);
          handleClearFile();
          toast.success(
            `${parsedContacts.length} contacts queued for processing`
          );
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleDialogChange = (newOpen: boolean) => {
    if (newOpen !== open) {
      setOpen(newOpen);
      if (!newOpen) {
        handleClearFile();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-1" />
          Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns: email (required), first name, last
            name
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {/* File Input */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              {fileName && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearFile}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {fileName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{fileName}</span>
              </div>
            )}
          </div>

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-2">
                <AlertCircle className="h-4 w-4" />
                <span>
                  {parseErrors.length} error{parseErrors.length > 1 ? "s" : ""}{" "}
                  found
                </span>
              </div>
              <ul className="text-sm text-destructive/80 space-y-1 max-h-24 overflow-y-auto">
                {parseErrors.slice(0, 5).map((error, index) => (
                  <li key={index}>
                    Row {error.row}: {error.message}
                  </li>
                ))}
                {parseErrors.length > 5 && (
                  <li>...and {parseErrors.length - 5} more errors</li>
                )}
              </ul>
            </div>
          )}

          {/* Preview Table */}
          {parsedContacts.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                Preview ({parsedContacts.length} contact
                {parsedContacts.length > 1 ? "s" : ""})
              </div>
              <div className="border rounded-md max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>First Name</TableHead>
                      <TableHead>Last Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedContacts.slice(0, 10).map((contact, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">
                          {contact.email}
                        </TableCell>
                        <TableCell>{contact.firstName || "-"}</TableCell>
                        <TableCell>{contact.lastName || "-"}</TableCell>
                      </TableRow>
                    ))}
                    {parsedContacts.length > 10 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          ...and {parsedContacts.length - 10} more contacts
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Sample CSV Format */}
          {!fileName && (
            <div className="rounded-md border bg-muted/50 p-3">
              <div className="text-sm font-medium mb-2">Expected CSV format</div>
              <pre className="text-xs text-muted-foreground font-mono">
                {`email,first name,last name
john@example.com,John,Doe
jane@example.com,Jane,Smith`}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={
                parsedContacts.length === 0 || addContactsMutation.isPending
              }
            >
              {addContactsMutation.isPending
                ? "Uploading..."
                : `Upload ${parsedContacts.length} contact${parsedContacts.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
