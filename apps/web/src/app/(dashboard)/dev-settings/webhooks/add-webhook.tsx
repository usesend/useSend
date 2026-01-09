"use client";

import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import { api } from "~/trpc/react";
import { useState } from "react";
import { CheckIcon, ClipboardCopy, Eye, EyeOff, Plus } from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
import { useForm } from "react-hook-form";
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
import { Checkbox } from "@usesend/ui/src/checkbox";

const WEBHOOK_EVENTS = [
  { value: "SENT", label: "Sent", description: "Email accepted for delivery" },
  { value: "DELIVERED", label: "Delivered", description: "Email delivered to recipient" },
  { value: "BOUNCED", label: "Bounced", description: "Email bounced" },
  { value: "COMPLAINED", label: "Complained", description: "Recipient marked as spam" },
  { value: "OPENED", label: "Opened", description: "Email was opened" },
  { value: "CLICKED", label: "Clicked", description: "Link was clicked" },
  { value: "FAILED", label: "Failed", description: "Email failed to send" },
] as const;

const webhookSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  url: z.string().url("Must be a valid URL"),
  events: z.array(z.string()).min(1, "Select at least one event"),
});

export default function AddWebhook() {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const createMutation = api.webhook.create.useMutation();
  const utils = api.useUtils();

  const form = useForm<z.infer<typeof webhookSchema>>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      name: "",
      url: "",
      events: ["DELIVERED", "BOUNCED", "COMPLAINED"],
    },
  });

  function handleSave(values: z.infer<typeof webhookSchema>) {
    createMutation.mutate(
      {
        name: values.name,
        url: values.url,
        events: values.events as any,
      },
      {
        onSuccess: (data) => {
          utils.webhook.invalidate();
          setSecret(data.secret);
          form.reset();
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  function handleCopy() {
    navigator.clipboard.writeText(secret);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  function copyAndClose() {
    handleCopy();
    setSecret("");
    setOpen(false);
    setShowSecret(false);
    toast.success("Webhook secret copied to clipboard");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => {
        if (_open !== open) {
          setOpen(_open);
          if (!_open) {
            setSecret("");
            setShowSecret(false);
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Add Webhook
        </Button>
      </DialogTrigger>
      {secret ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your webhook secret</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This secret is used to verify webhook payloads. Save it now - you
            won't be able to see it again.
          </p>
          <div className="py-1 bg-secondary rounded-lg px-4 flex items-center justify-between mt-2">
            <div className="flex-1 overflow-hidden">
              {showSecret ? (
                <p className="text-sm font-mono break-all">{secret}</p>
              ) : (
                <div className="flex gap-1">
                  {Array.from({ length: 40 }).map((_, index) => (
                    <div
                      key={index}
                      className="w-1 h-1 bg-muted-foreground rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 ml-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {isCopied ? (
                  <CheckIcon className="h-4 w-4 text-green-500" />
                ) : (
                  <ClipboardCopy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
            <p className="font-medium mb-2">Verify webhook signatures:</p>
            <pre className="text-xs overflow-x-auto">
{`const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expected;
}`}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={copyAndClose}>Copy & Close</Button>
          </DialogFooter>
        </DialogContent>
      ) : (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a new webhook</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSave)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Production webhook" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endpoint URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://api.example.com/webhooks"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        We'll send POST requests to this URL.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="events"
                  render={() => (
                    <FormItem>
                      <FormLabel>Events to subscribe</FormLabel>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {WEBHOOK_EVENTS.map((event) => (
                          <FormField
                            key={event.value}
                            control={form.control}
                            name="events"
                            render={({ field }) => (
                              <FormItem className="flex items-start space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(event.value)}
                                    onCheckedChange={(checked) => {
                                      const updated = checked
                                        ? [...field.value, event.value]
                                        : field.value?.filter(
                                            (v) => v !== event.value
                                          );
                                      field.onChange(updated);
                                    }}
                                  />
                                </FormControl>
                                <div className="leading-none">
                                  <FormLabel className="font-normal cursor-pointer">
                                    {event.label}
                                  </FormLabel>
                                  <p className="text-xs text-muted-foreground">
                                    {event.description}
                                  </p>
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
