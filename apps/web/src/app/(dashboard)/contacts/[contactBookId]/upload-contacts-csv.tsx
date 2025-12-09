"use client";

import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Dialog,
  DialogContent,
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
import { Upload } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";
import Papa from "papaparse";

interface ParsedContact {
  email: string;
  firstName?: string;
  lastName?: string;
}

export default function UploadContactsCsv({
  contactBookId,
}: {
  contactBookId: string;
}) {
  const [open, setOpen] = useState(false);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addContactsMutation = api.contacts.addContacts.useMutation();
  const utils = api.useUtils();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const contacts: ParsedContact[] = [];
          const errors: string[] = [];

          results.data.forEach((row: any, index: number) => {
            // Support multiple column name variations
            const email =
              row.email ||
              row.Email ||
              row.EMAIL ||
              row["E-mail"] ||
              row["e-mail"];
            const firstName =
              row.firstName ||
              row.FirstName ||
              row.first_name ||
              row["First Name"] ||
              row.firstname ||
              row.Firstname;
            const lastName =
              row.lastName ||
              row.LastName ||
              row.last_name ||
              row["Last Name"] ||
              row.lastname ||
              row.Lastname;

            if (!email || typeof email !== "string" || !email.trim()) {
              errors.push(`Row ${index + 1}: Missing or invalid email`);
              return;
            }

            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
              errors.push(`Row ${index + 1}: Invalid email format (${email})`);
              return;
            }

            contacts.push({
              email: email.trim(),
              firstName: firstName?.trim() || undefined,
              lastName: lastName?.trim() || undefined,
            });
          });

          if (errors.length > 0 && contacts.length === 0) {
            toast.error(
              `Failed to parse CSV: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? "..." : ""}`
            );
            setParsedContacts([]);
          } else {
            if (errors.length > 0) {
              toast.warning(
                `Skipped ${errors.length} invalid row(s). Parsed ${contacts.length} valid contact(s).`
              );
            } else {
              toast.success(`Parsed ${contacts.length} contact(s) from CSV`);
            }
            setParsedContacts(contacts);
          }
        } catch (error) {
          toast.error("Failed to parse CSV file");
          setParsedContacts([]);
        } finally {
          setIsUploading(false);
        }
      },
      error: (error) => {
        toast.error(`CSV parsing error: ${error.message}`);
        setIsUploading(false);
        setParsedContacts([]);
      },
    });
  };

  const handleUploadContacts = async () => {
    if (parsedContacts.length === 0) {
      toast.error("No contacts to upload");
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
          setOpen(false);
          setParsedContacts([]);
          setFileName("");
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          toast.success("Contacts queued for processing");
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleDialogChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setParsedContacts([]);
      setFileName("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-1" />
          Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Contacts from CSV</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select CSV File</label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={isUploading || addContactsMutation.isPending}
            />
            <p className="text-sm text-muted-foreground">
              CSV should include columns: <strong>email</strong> (required),{" "}
              <strong>firstName</strong> (optional), <strong>lastName</strong>{" "}
              (optional)
            </p>
          </div>

          {fileName && (
            <p className="text-sm text-muted-foreground">
              File: <strong>{fileName}</strong>
            </p>
          )}

          {isUploading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          )}

          {parsedContacts.length > 0 && !isUploading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Preview ({parsedContacts.length} contact
                  {parsedContacts.length !== 1 ? "s" : ""})
                </p>
              </div>

              <div className="border rounded-md max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>First Name</TableHead>
                      <TableHead>Last Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedContacts.slice(0, 100).map((contact, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {contact.email}
                        </TableCell>
                        <TableCell>
                          {contact.firstName || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {contact.lastName || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {parsedContacts.length > 100 && (
                <p className="text-sm text-muted-foreground">
                  Showing first 100 contacts. All {parsedContacts.length}{" "}
                  contacts will be uploaded.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDialogChange(false)}
                  disabled={addContactsMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUploadContacts}
                  disabled={addContactsMutation.isPending}
                >
                  {addContactsMutation.isPending
                    ? "Uploading..."
                    : `Upload ${parsedContacts.length} Contact${parsedContacts.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
