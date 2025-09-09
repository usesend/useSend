"use client";

import { Button } from "@usesend/ui/src/button";
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
import { Copy } from "lucide-react";
import { Template } from "@prisma/client";

export const DuplicateTemplate: React.FC<{
  template: Partial<Template> & { id: string };
}> = ({ template }) => {
  const [open, setOpen] = useState(false);
  const duplicateTemplateMutation =
    api.template.duplicateTemplate.useMutation();

  const utils = api.useUtils();

  async function onTemplateDuplicate() {
    duplicateTemplateMutation.mutate(
      {
        templateId: template.id,
      },
      {
        onSuccess: () => {
          utils.template.getTemplates.invalidate();
          setOpen(false);
          toast.success(`Template duplicated`);
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
        <Button variant="ghost" size="sm" className="p-0 hover:bg-transparent">
          <Copy className="h-[18px] w-[18px] text-blue/80" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Template</DialogTitle>
          <DialogDescription>
            Are you sure you want to duplicate{" "}
            <span className="font-semibold text-foreground">
              {template.name}
            </span>
            ?
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <div className="flex justify-end">
            <Button
              onClick={onTemplateDuplicate}
              variant="default"
              disabled={duplicateTemplateMutation.isPending}
            >
              {duplicateTemplateMutation.isPending
                ? "Duplicating..."
                : "Duplicate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateTemplate;
