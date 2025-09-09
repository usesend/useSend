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
import { Template } from "@prisma/client";

const templateSchema = z.object({
  name: z.string(),
});

export const DeleteTemplate: React.FC<{
  template: Partial<Template> & { id: string };
}> = ({ template }) => {
  const [open, setOpen] = useState(false);
  const deleteTemplateMutation = api.template.deleteTemplate.useMutation();

  const utils = api.useUtils();

  const templateForm = useForm<z.infer<typeof templateSchema>>({
    resolver: zodResolver(templateSchema),
  });

  async function onTemplateDelete(values: z.infer<typeof templateSchema>) {
    if (values.name !== template.name) {
      templateForm.setError("name", {
        message: "Name does not match",
      });
      return;
    }

    deleteTemplateMutation.mutate(
      {
        templateId: template.id,
      },
      {
        onSuccess: () => {
          utils.template.getTemplates.invalidate();
          setOpen(false);
          toast.success(`Template deleted`);
        },
      },
    );
  }

  const name = templateForm.watch("name");

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent">
          <Trash2 className="h-[18px] w-[18px] text-red/80" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Template</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">
              {template.name}
            </span>
            ? You can't reverse this.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Form {...templateForm}>
            <form
              onSubmit={templateForm.handleSubmit(onTemplateDelete)}
              className="space-y-4"
            >
              <FormField
                control={templateForm.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>name</FormLabel>
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
                    deleteTemplateMutation.isPending || template.name !== name
                  }
                >
                  {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteTemplate;
