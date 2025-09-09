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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";

import { api } from "~/trpc/react";
import React, { useState } from "react";
import { Domain } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const domainSchema = z.object({
  domain: z.string(),
});

export const DeleteDomain: React.FC<{ domain: Domain }> = ({ domain }) => {
  const [open, setOpen] = useState(false);
  const [domainName, setDomainName] = useState("");
  const deleteDomainMutation = api.domain.deleteDomain.useMutation();

  const domainForm = useForm<z.infer<typeof domainSchema>>({
    resolver: zodResolver(domainSchema),
  });

  const utils = api.useUtils();

  const router = useRouter();

  async function onDomainDelete(values: z.infer<typeof domainSchema>) {
    if (values.domain !== domain.name) {
      domainForm.setError("domain", {
        message: "Domain name does not match",
      });
      return;
    }

    deleteDomainMutation.mutate(
      {
        id: domain.id,
      },
      {
        onSuccess: () => {
          utils.domain.domains.invalidate();
          setOpen(false);
          toast.success(`Domain ${domain.name} deleted`);
          router.replace("/domains");
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" className="w-[150px]" size="sm">
          Delete domain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete domain</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">{domain.name}</span>
            ? You can't reverse this.
          </DialogDescription>
        </DialogHeader>
        <Form {...domainForm}>
          <form
            onSubmit={domainForm.handleSubmit(onDomainDelete)}
            className="space-y-4"
          >
            <FormField
              control={domainForm.control}
              name="domain"
              render={({ field, formState }) => (
                <FormItem>
                  <FormLabel>Domain</FormLabel>
                  <FormControl>
                    <Input placeholder="subdomain.example.com" {...field} />
                  </FormControl>
                  {formState.errors.domain ? (
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
                disabled={deleteDomainMutation.isPending}
              >
                {deleteDomainMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteDomain;
