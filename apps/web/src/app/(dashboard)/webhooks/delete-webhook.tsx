"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { type Webhook } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
import { Trash2 } from "lucide-react";

export const DeleteWebhook: React.FC<{
  webhook: Webhook;
}> = ({ webhook }) => {
  const deleteWebhookMutation = api.webhook.delete.useMutation();
  const utils = api.useUtils();

  const schema = z
    .object({
      confirmation: z.string().min(1, "Please type the webhook URL to confirm"),
    })
    .refine((data) => data.confirmation === webhook.url, {
      message: "Webhook URL does not match",
      path: ["confirmation"],
    });

  async function onConfirm(values: z.infer<typeof schema>) {
    deleteWebhookMutation.mutate(
      { id: webhook.id },
      {
        onSuccess: async () => {
          await utils.webhook.list.invalidate();
          toast.success("Webhook deleted");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Delete webhook"
      resourceName={webhook.url}
      schema={schema}
      isLoading={deleteWebhookMutation.isPending}
      onConfirm={onConfirm}
      confirmLabel="Delete webhook"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start rounded-lg text-red/80 hover:bg-accent hover:text-red"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      }
    />
  );
};
