"use client";

import { Button } from "@usesend/ui/src/button";
import { DeleteResource } from "~/components/DeleteResource";
import { api } from "~/trpc/react";
import { Template } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { Trash2 } from "lucide-react";
import { z } from "zod";

export const DeleteTemplate: React.FC<{
  template: Partial<Template> & { id: string };
}> = ({ template }) => {
  const deleteTemplateMutation = api.template.deleteTemplate.useMutation();
  const utils = api.useUtils();

  const templateSchema = z
    .object({
      confirmation: z
        .string()
        .min(1, "Please type the template name to confirm"),
    })
    .refine((data) => data.confirmation === template.name, {
      message: "Template name does not match",
      path: ["confirmation"],
    });

  async function onTemplateDelete(values: z.infer<typeof templateSchema>) {
    deleteTemplateMutation.mutate(
      {
        templateId: template.id,
      },
      {
        onSuccess: () => {
          utils.template.getTemplates.invalidate();
          toast.success(`Template deleted`);
        },
      },
    );
  }

  return (
    <DeleteResource
      title="Delete Template"
      resourceName={template.name || ""}
      schema={templateSchema}
      isLoading={deleteTemplateMutation.isPending}
      onConfirm={onTemplateDelete}
      trigger={
        <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent">
          <Trash2 className="h-[18px] w-[18px] text-red/80" />
        </Button>
      }
      confirmLabel="Delete Template"
    />
  );
};

export default DeleteTemplate;
