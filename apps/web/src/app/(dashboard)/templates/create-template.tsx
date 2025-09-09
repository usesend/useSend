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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";

import { api } from "~/trpc/react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@usesend/ui/src/toaster";
import { useRouter } from "next/navigation";
import Spinner from "@usesend/ui/src/spinner";

const templateSchema = z.object({
  name: z.string({ required_error: "Name is required" }).min(1, {
    message: "Name is required",
  }),
  subject: z.string({ required_error: "Subject is required" }).min(1, {
    message: "Subject is required",
  }),
});

export default function CreateTemplate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const createTemplateMutation = api.template.createTemplate.useMutation();

  const templateForm = useForm<z.infer<typeof templateSchema>>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      subject: "",
    },
  });

  const utils = api.useUtils();

  async function onTemplateCreate(values: z.infer<typeof templateSchema>) {
    createTemplateMutation.mutate(
      {
        name: values.name,
        subject: values.subject,
      },
      {
        onSuccess: async (data) => {
          utils.template.getTemplates.invalidate();
          router.push(`/templates/${data.id}/edit`);
          toast.success("Template created successfully");
          setOpen(false);
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
          Create Template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new template</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...templateForm}>
            <form
              onSubmit={templateForm.handleSubmit(onTemplateCreate)}
              className="space-y-8"
            >
              <FormField
                control={templateForm.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Template Name" {...field} />
                    </FormControl>
                    {formState.errors.name ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <FormField
                control={templateForm.control}
                name="subject"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="Template Subject" {...field} />
                    </FormControl>
                    {formState.errors.subject ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <p className="text-muted-foreground text-sm">
                Don't worry, you can change it later.
              </p>
              <div className="flex justify-end">
                <Button
                  className=" w-[100px]"
                  type="submit"
                  disabled={createTemplateMutation.isPending}
                >
                  {createTemplateMutation.isPending ? (
                    <Spinner className="w-4 h-4" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
