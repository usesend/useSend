"use client";

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
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "~/trpc/react";
import { Input } from "@usesend/ui/src/input";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { isLocalhost } from "~/utils/client";

const FormSchema = z.object({
  region: z.string(),
  usesendUrl: z.string().url(),
  sendRate: z.coerce.number(),
  transactionalQuota: z.coerce.number().min(0).max(100),
});

type SesSettingsProps = {
  onSuccess?: () => void;
};

export const AddSesSettings: React.FC<SesSettingsProps> = ({ onSuccess }) => {
  return (
    <div className="flex items-center justify-center min-h-screen ">
      <div className=" w-[400px] flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-center">
            Add SES Settings
          </h1>
        </div>
        <AddSesSettingsForm onSuccess={onSuccess} />
      </div>
    </div>
  );
};

export const AddSesSettingsForm: React.FC<SesSettingsProps> = ({
  onSuccess,
}) => {
  const addSesSettings = api.admin.addSesSettings.useMutation();

  const utils = api.useUtils();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      region: "",
      usesendUrl: "",
      sendRate: 1,
      transactionalQuota: 50,
    },
  });

  function onSubmit(data: z.infer<typeof FormSchema>) {
    const localhost = isLocalhost();

    if (!data.usesendUrl.startsWith("https://") && !localhost) {
      form.setError("usesendUrl", {
        message: "URL must start with https://",
      });
      return;
    }

    if (data.usesendUrl.includes("localhost") && !localhost) {
      form.setError("usesendUrl", {
        message: "URL must be a valid url",
      });
      return;
    }

    addSesSettings.mutate(
      {
        region: data.region,
        usesendUrl: data.usesendUrl,
        sendRate: data.sendRate,
        transactionalQuota: data.transactionalQuota,
      },
      {
        onSuccess: () => {
          utils.admin.invalidate();
          onSuccess?.();
        },
        onError: (e) => {
          toast.error("Failed to create", {
            description: e.message,
          });
        },
      },
    );
  }

  const onRegionInputOutOfFocus = async () => {
    const region = form.getValues("region");

    if (region) {
      const quota = await utils.admin.getQuotaForRegion.fetch({ region });
      form.setValue("sendRate", quota ?? 1);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className=" flex flex-col gap-8 w-full"
      >
        <FormField
          control={form.control}
          name="region"
          render={({ field, formState }) => (
            <FormItem>
              <FormLabel>Region</FormLabel>
              <FormControl>
                <Input
                  placeholder="us-east-1"
                  className="w-full"
                  {...field}
                  onBlur={() => {
                    onRegionInputOutOfFocus();
                    field.onBlur();
                  }}
                />
              </FormControl>
              {formState.errors.region ? (
                <FormMessage />
              ) : (
                <FormDescription>The region of the SES account</FormDescription>
              )}
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="usesendUrl"
          render={({ field, formState }) => (
            <FormItem>
              <FormLabel>Callback URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://example.com"
                  className="w-full"
                  {...field}
                />
              </FormControl>
              {formState.errors.usesendUrl ? (
                <FormMessage />
              ) : (
                <FormDescription>
                  This url should be accessible from the internet. Will be
                  called from SES
                </FormDescription>
              )}
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sendRate"
          render={({ field, formState }) => (
            <FormItem>
              <FormLabel>Send Rate</FormLabel>
              <FormControl>
                <Input placeholder="1" className="w-full" {...field} />
              </FormControl>
              {formState.errors.sendRate ? (
                <FormMessage />
              ) : (
                <FormDescription>
                  The number of emails to send per second.
                </FormDescription>
              )}
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="transactionalQuota"
          render={({ field, formState }) => (
            <FormItem>
              <FormLabel>Transactional Quota</FormLabel>
              <FormControl>
                <Input placeholder="0" className="w-full" {...field} />
              </FormControl>
              {formState.errors.transactionalQuota ? (
                <FormMessage />
              ) : (
                <FormDescription>
                  The percentage of the quota to be used for transactional
                  emails (0-100%).
                </FormDescription>
              )}
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={addSesSettings.isPending}
          className="w-[200px] mx-auto"
        >
          {addSesSettings.isPending ? (
            <Spinner className="w-5 h-5" />
          ) : (
            "Create"
          )}
        </Button>
      </form>
    </Form>
  );
};
