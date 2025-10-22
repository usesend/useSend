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

import { Copy, Check } from "lucide-react";
import React, { useState } from "react";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ReactNode } from "react";

const defaultSchema = z.object({
  confirmation: z.string(),
});

export interface DeleteResourceProps {
  title: string;
  resourceName: string;
  descriptionBody?: ReactNode | string;
  confirmLabel?: string;
  isLoading?: boolean;
  // eslint-disable-next-line no-unused-vars
  onConfirm: (values: z.infer<typeof defaultSchema>) => void | Promise<void>;
  open?: boolean;
  // eslint-disable-next-line no-unused-vars
  onOpenChange?: (open: boolean) => void;
  schema?: typeof defaultSchema;
  trigger?: React.ReactNode;
  children?: React.ReactNode;
}

export const DeleteResource: React.FC<DeleteResourceProps> = ({
  title,
  resourceName,
  descriptionBody,
  confirmLabel = "Delete",
  isLoading = false,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
  schema = defaultSchema,
  trigger,
  children,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const setOpen = onOpenChange || setInternalOpen;

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(resourceName);
      setCopied(true);

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const handleSubmit = async (values: z.infer<typeof schema>) => {
    await onConfirm(values);
  };

  const defaultDescription = (
    <>
      Are you sure you want to delete{" "}
      <span className="font-semibold text-foreground">{resourceName}</span>? You
      can't reverse this.
    </>
  );

  return (
    <Dialog
      open={controlledOpen !== undefined ? controlledOpen : internalOpen}
      onOpenChange={setOpen}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {descriptionBody || defaultDescription}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Type{" "}
                <div
                  className="px-1 py-0.5 font-mono border rounded flex gap-1 items-center cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={copyToClipboard}
                >
                  <code className="text-sm">{resourceName}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard();
                    }}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                below
              </div>
              <FormField
                control={form.control}
                name="confirmation"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Input placeholder={`${resourceName}`} {...field} />
                      </div>
                    </FormControl>
                    {formState.errors.confirmation ? (
                      <FormMessage />
                    ) : (
                      <FormDescription className="text-transparent">
                        .
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
            </div>
            {children}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isLoading}>
                {isLoading ? "Deleting..." : confirmLabel}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteResource;
