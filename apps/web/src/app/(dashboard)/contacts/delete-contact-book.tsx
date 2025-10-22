"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { ContactBook } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";
import { z } from "zod";

const contactBookSchema = z.object({
  confirmation: z
    .string()
    .min(1, "Please type the contact book name to confirm"),
});

export const DeleteContactBook: React.FC<{
  contactBook: Partial<ContactBook> & { id: string };
}> = ({ contactBook }) => {
  const deleteContactBookMutation =
    api.contacts.deleteContactBook.useMutation();
  const utils = api.useUtils();

  async function onContactBookDelete(
    values: z.infer<typeof contactBookSchema>,
  ) {
    if (values.confirmation !== contactBook.name) {
      throw new Error("Contact book name does not match");
    }

    deleteContactBookMutation.mutate(
      {
        contactBookId: contactBook.id,
      },
      {
        onSuccess: () => {
          utils.contacts.getContactBooks.invalidate();
          toast.success(`Contact book deleted`);
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Delete Contact Book"
      resourceName={contactBook.name || ""}
      schema={contactBookSchema}
      isLoading={deleteContactBookMutation.isPending}
      onConfirm={onContactBookDelete}
      trigger={
        <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent ">
          <Trash2 className="h-[18px] w-[18px] text-red/80 hover:text-red/70" />
        </Button>
      }
      confirmLabel="Delete Contact Book"
    />
  );
};

export default DeleteContactBook;
