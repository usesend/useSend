"use client";

import { Button } from "@usesend/ui/src/button";
import { Textarea } from "@usesend/ui/src/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";

import { api } from "~/trpc/react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@usesend/ui/src/toaster";

const contactsSchema = z.object({
  contacts: z.string({ required_error: "Contacts are required" }).min(1, {
    message: "Contacts are required",
  }),
});

export default function AddContact({
  contactBookId,
}: {
  contactBookId: string;
}) {
  const [open, setOpen] = useState(false);

  const addContactsMutation = api.contacts.addContacts.useMutation();

  const contactsForm = useForm<z.infer<typeof contactsSchema>>({
    resolver: zodResolver(contactsSchema),
    defaultValues: {
      contacts: "",
    },
  });

  const utils = api.useUtils();

  async function onContactsAdd(values: z.infer<typeof contactsSchema>) {
    const contactsArray = values.contacts.split(",").map((email) => ({
      email: email.trim(),
    }));

    addContactsMutation.mutate(
      {
        contactBookId,
        contacts: contactsArray,
      },
      {
        onSuccess: async () => {
          utils.contacts.contacts.invalidate();
          setOpen(false);
          toast.success("Contacts added successfully");
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Add Contacts
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new contacts</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...contactsForm}>
            <form
              onSubmit={contactsForm.handleSubmit(onContactsAdd)}
              className="space-y-8"
            >
              <FormField
                control={contactsForm.control}
                name="contacts"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Contacts</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="email1@example.com, email2@example.com"
                        {...field}
                      />
                    </FormControl>
                    {formState.errors.contacts ? (
                      <FormMessage />
                    ) : (
                      <FormDescription>
                        Enter comma-separated email addresses.
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  className=" w-[100px]"
                  type="submit"
                  disabled={addContactsMutation.isPending}
                >
                  {addContactsMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
