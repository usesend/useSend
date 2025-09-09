"use client";

import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";

import { Edit } from "lucide-react";
import { useState } from "react";
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
import { toast } from "@usesend/ui/src/toaster";
import Spinner from "@usesend/ui/src/spinner";
import { SesSetting } from "@prisma/client";

const FormSchema = z.object({
  settingsId: z.string(),
  sendRate: z.coerce.number(),
  transactionalQuota: z.coerce.number().min(0).max(100),
});

export default function EditSesConfiguration({
  setting,
}: {
  setting: SesSetting;
}) {
  const [open, setOpen] = useState(false);

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
          <DialogTitle>Edit SES configuration</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <EditSesSettingsForm
            setting={setting}
            onSuccess={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SesSettingsProps = {
  setting: SesSetting;
  onSuccess?: () => void;
};

export const EditSesSettingsForm: React.FC<SesSettingsProps> = ({
  setting,
  onSuccess,
}) => {
  const updateSesSettings = api.admin.updateSesSettings.useMutation();

  const utils = api.useUtils();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      settingsId: setting.id,
      sendRate: setting.sesEmailRateLimit,
      transactionalQuota: setting.transactionalQuota,
    },
  });

  function onSubmit(data: z.infer<typeof FormSchema>) {
    updateSesSettings.mutate(data, {
      onSuccess: () => {
        utils.admin.invalidate();
        onSuccess?.();
      },
      onError: (e) => {
        toast.error("Failed to update", {
          description: e.message,
        });
      },
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className=" flex flex-col gap-8 w-full"
      >
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
          disabled={updateSesSettings.isPending}
          className="w-[200px] mx-auto"
        >
          {updateSesSettings.isPending ? (
            <Spinner className="w-5 h-5" />
          ) : (
            "Update"
          )}
        </Button>
      </form>
    </Form>
  );
};
