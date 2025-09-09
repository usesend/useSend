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
import { Edit } from "lucide-react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@usesend/ui/src/toaster";
import { Switch } from "@usesend/ui/src/switch";
import { Contact } from "@prisma/client";

const contactSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  subscribed: z.boolean().optional(),
});

export const EditContact: React.FC<{
  contact: Partial<Contact> & { id: string; contactBookId: string };
}> = ({ contact }) => {
  const [open, setOpen] = useState(false);
  const updateContactMutation = api.contacts.updateContact.useMutation();

  const utils = api.useUtils();
  const router = useRouter();

  const contactForm = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      email: contact.email || "",
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      subscribed: contact.subscribed || false,
    },
  });

  async function onContactUpdate(values: z.infer<typeof contactSchema>) {
    updateContactMutation.mutate(
      {
        contactId: contact.id,
        contactBookId: contact.contactBookId,
        ...values,
      },
      {
        onSuccess: async () => {
          utils.contacts.contacts.invalidate();
          setOpen(false);
          toast.success("Contact updated successfully");
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
        <Button variant="ghost" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...contactForm}>
            <form
              onSubmit={contactForm.handleSubmit(onContactUpdate)}
              className="space-y-8"
            >
              <FormField
                control={contactForm.control}
                name="email"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="email@example.com" {...field} />
                    </FormControl>
                    {formState.errors.email ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="firstName"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="First Name" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="lastName"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Last Name" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={contactForm.control}
                name="subscribed"
                render={({ field }) => (
                  <FormItem className="fle flex-row gap-2">
                    <div>
                      <FormLabel>Subscribed</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-success"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button
                  className=" w-[100px] "
                  type="submit"
                  disabled={updateContactMutation.isPending}
                >
                  {updateContactMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditContact;
