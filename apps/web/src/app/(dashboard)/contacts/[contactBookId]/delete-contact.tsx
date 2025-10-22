"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { Contact } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";
import { z } from "zod";

const contactSchema = z.object({
  confirmation: z.string().email("Please enter a valid email address"),
});

export const DeleteContact: React.FC<{
  contact: Partial<Contact> & { id: string; contactBookId: string };
}> = ({ contact }) => {
  const deleteContactMutation = api.contacts.deleteContact.useMutation();
  const utils = api.useUtils();

  async function onContactDelete(values: z.infer<typeof contactSchema>) {
    if (values.confirmation !== contact.email) {
      throw new Error("Email does not match");
    }

    deleteContactMutation.mutate(
      {
        contactId: contact.id,
        contactBookId: contact.contactBookId,
      },
      {
        onSuccess: () => {
          utils.contacts.contacts.invalidate();
          toast.success(`Contact deleted`);
        },
        onError: (e) => {
          toast.error(`Contact not deleted: ${e.message}`);
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Delete Contact"
      resourceName={contact.email || ""}
      schema={contactSchema}
      isLoading={deleteContactMutation.isPending}
      onConfirm={onContactDelete}
      trigger={
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4 text-red/80" />
        </Button>
      }
      confirmLabel="Delete Contact"
    />
  );
};

export default DeleteContact;
