"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { ApiKey } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";
import { z } from "zod";

export const DeleteApiKey: React.FC<{
  apiKey: Partial<ApiKey> & { id: number };
}> = ({ apiKey }) => {
  const deleteApiKeyMutation = api.apiKey.deleteApiKey.useMutation();
  const utils = api.useUtils();

  const apiKeySchema = z
    .object({
      confirmation: z
        .string()
        .min(1, "Please type the API key name to confirm"),
    })
    .refine((data) => data.confirmation === apiKey.name, {
      message: "API key name does not match",
      path: ["confirmation"],
    });

  async function onApiKeyDelete(values: z.infer<typeof apiKeySchema>) {
    deleteApiKeyMutation.mutate(
      {
        id: apiKey.id,
      },
      {
        onSuccess: () => {
          utils.apiKey.invalidate();
          toast.success(`API key deleted`);
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Delete API key"
      resourceName={apiKey.name || ""}
      schema={apiKeySchema}
      isLoading={deleteApiKeyMutation.isPending}
      onConfirm={onApiKeyDelete}
      trigger={
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4 text-red/80" />
        </Button>
      }
      confirmLabel="Delete API key"
    />
  );
};

export default DeleteApiKey;
