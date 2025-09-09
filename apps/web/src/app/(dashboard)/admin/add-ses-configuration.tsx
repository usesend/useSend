"use client";

import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AddSesSettingsForm } from "~/components/settings/AddSesSettings";

export default function AddSesConfiguration() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Add SES configuration
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new SES configuration</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <AddSesSettingsForm onSuccess={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
