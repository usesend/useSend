"use client";

import { use, useEffect } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Switch } from "@usesend/ui/src/switch";
import { Button } from "@usesend/ui/src/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { Skeleton } from "@usesend/ui/src/skeleton";

const schema = z
  .object({
    doubleOptInEnabled: z.boolean(),
    defaultDomainId: z.string().nullable(),
    doubleOptInTemplateId: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.doubleOptInEnabled) {
      return;
    }

    if (!value.defaultDomainId) {
      ctx.addIssue({
        path: ["defaultDomainId"],
        code: z.ZodIssueCode.custom,
        message: "Choose a verified domain",
      });
    }

    if (!value.doubleOptInTemplateId) {
      ctx.addIssue({
        path: ["doubleOptInTemplateId"],
        code: z.ZodIssueCode.custom,
        message: "Select a confirmation template",
      });
    }
  });

export default function ContactBookSettingsPage({
  params,
}: {
  params: Promise<{ contactBookId: string }>;
}) {
  const { contactBookId } = use(params);

  const utils = api.useUtils();

  const settingsQuery = api.contacts.getContactBookSettings.useQuery({
    contactBookId,
  });

  const updateMutation = api.contacts.updateContactBook.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.contacts.getContactBookSettings.invalidate({ contactBookId }),
        utils.contacts.getContactBookDetails.invalidate({ contactBookId }),
      ]);
      toast.success("Settings updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      doubleOptInEnabled: false,
      defaultDomainId: null,
      doubleOptInTemplateId: null,
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const { contactBook } = settingsQuery.data;
    form.reset({
      doubleOptInEnabled: contactBook.doubleOptInEnabled,
      defaultDomainId: contactBook.defaultDomainId
        ? String(contactBook.defaultDomainId)
        : null,
      doubleOptInTemplateId: contactBook.doubleOptInTemplateId,
    });
  }, [settingsQuery.data, form]);

  const onSubmit = form.handleSubmit((values) => {
    updateMutation.mutate({
      contactBookId,
      doubleOptInEnabled: values.doubleOptInEnabled,
      defaultDomainId: values.defaultDomainId
        ? Number(values.defaultDomainId)
        : null,
      doubleOptInTemplateId: values.doubleOptInTemplateId,
    });
  });

  if (settingsQuery.isLoading || !settingsQuery.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const { domains, templates } = settingsQuery.data;

  const disableSelectorsBase =
    !form.watch("doubleOptInEnabled") || domains.length === 0;
  const disableDomainSelect = disableSelectorsBase;
  const disableTemplateSelect = disableSelectorsBase || templates.length === 0;

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Double opt-in</h1>
        <p className="text-sm text-muted-foreground">
          Require new contacts to confirm their email address before they are
          subscribed.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-8">
          <FormField
            control={form.control}
            name="doubleOptInEnabled"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <FormLabel>Require confirmation</FormLabel>
                  <p className="text-sm text-muted-foreground">
                    Send a confirmation email when contacts are added via the
                    API.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="defaultDomainId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From domain</FormLabel>
                <FormControl>
                  <Select
                    value={field.value ?? undefined}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={disableDomainSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a verified domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map((domain) => (
                        <SelectItem key={domain.id} value={String(domain.id)}>
                          {domain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                {domains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add a verified domain before enabling double opt-in.
                  </p>
                ) : (
                  <FormMessage />
                )}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="doubleOptInTemplateId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmation email</FormLabel>
                <FormControl>
                  <Select
                    value={field.value ?? undefined}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={disableTemplateSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <p className="text-sm text-muted-foreground">
                  Templates must include the {"{{verificationUrl}}"} placeholder.
                  {templates.length === 0
                    ? " Create or publish a template before enabling double opt-in."
                    : ""}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
