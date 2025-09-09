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
import { api } from "~/trpc/react";
import React, { useState } from "react";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { ContactBook } from "@prisma/client";

const contactBookSchema = z.object({
  name: z.string(),
});

export const DeleteContactBook: React.FC<{
  contactBook: Partial<ContactBook> & { id: string };
}> = ({ contactBook }) => {
  const [open, setOpen] = useState(false);
  const deleteContactBookMutation =
    api.contacts.deleteContactBook.useMutation();

  const utils = api.useUtils();

  const contactBookForm = useForm<z.infer<typeof contactBookSchema>>({
    resolver: zodResolver(contactBookSchema),
  });

  async function onContactBookDelete(
    values: z.infer<typeof contactBookSchema>,
  ) {
    if (values.name !== contactBook.name) {
      contactBookForm.setError("name", {
        message: "Name does not match",
      });
      return;
    }

    deleteContactBookMutation.mutate(
      {
        contactBookId: contactBook.id,
      },
      {
        onSuccess: () => {
          utils.contacts.getContactBooks.invalidate();
          setOpen(false);
          toast.success(`Contact book deleted`);
        },
      },
    );
  }

  const name = contactBookForm.watch("name");

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent ">
          <Trash2 className="h-[18px] w-[18px] text-red/80 hover:text-red/70" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Contact Book</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">
              {contactBook.name}
            </span>
            ? You can't reverse this.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Form {...contactBookForm}>
            <form
              onSubmit={contactBookForm.handleSubmit(onContactBookDelete)}
              className="space-y-4"
            >
              <FormField
                control={contactBookForm.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Contact book name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    {formState.errors.name ? (
                      <FormMessage />
                    ) : (
                      <FormDescription className=" text-transparent">
                        .
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    deleteContactBookMutation.isPending ||
                    contactBook.name !== name
                  }
                >
                  {deleteContactBookMutation.isPending
                    ? "Deleting..."
                    : "Delete"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteContactBook;
