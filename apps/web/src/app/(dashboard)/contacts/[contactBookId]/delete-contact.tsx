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
import { Contact } from "@prisma/client";

const contactSchema = z.object({
  email: z.string().email(),
});

export const DeleteContact: React.FC<{
  contact: Partial<Contact> & { id: string; contactBookId: string };
}> = ({ contact }) => {
  const [open, setOpen] = useState(false);
  const deleteContactMutation = api.contacts.deleteContact.useMutation();

  const utils = api.useUtils();

  const contactForm = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
  });

  async function onContactDelete(values: z.infer<typeof contactSchema>) {
    if (values.email !== contact.email) {
      contactForm.setError("email", {
        message: "Email does not match",
      });
      return;
    }

    deleteContactMutation.mutate(
      {
        contactId: contact.id,
        contactBookId: contact.contactBookId,
      },
      {
        onSuccess: () => {
          utils.contacts.contacts.invalidate();
          setOpen(false);
          toast.success(`Contact deleted`);
        },
        onError: (e) => {
          toast.error(`Contact not deleted: ${e.message}`);
        },
      },
    );
  }

  const email = contactForm.watch("email");

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4 text-red/80" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Contact</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">
              {contact.email}
            </span>
            ? You can't reverse this.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Form {...contactForm}>
            <form
              onSubmit={contactForm.handleSubmit(onContactDelete)}
              className="space-y-4"
            >
              <FormField
                control={contactForm.control}
                name="email"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    {formState.errors.email ? (
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
                    deleteContactMutation.isPending || contact.email !== email
                  }
                >
                  {deleteContactMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteContact;
