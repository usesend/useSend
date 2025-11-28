"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Textarea } from "@usesend/ui/src/textarea";
import { toast } from "@usesend/ui/src/toaster";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api } from "~/trpc/react";

const FeedbackSchema = z.object({
  message: z.string().trim().min(1, "Feedback is required").max(2000),
});

export function FeedbackDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  const form = useForm<z.infer<typeof FeedbackSchema>>({
    resolver: zodResolver(FeedbackSchema),
    defaultValues: {
      message: "",
    },
  });

  const feedbackMutation = api.feedback.send.useMutation({
    onSuccess: () => {
      toast.success("Thanks for sharing your feedback!");
      form.reset();
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const messageValue = form.watch("message");
  const trimmedMessage = messageValue?.trim() ?? "";

  useEffect(() => {
    const platform = navigator.userAgent || navigator.platform || "unknown";
    setIsMac(/Mac|iPhone|iPod|iPad/i.test(platform));
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset();
    }
  }

  function onSubmit(values: z.infer<typeof FeedbackSchema>) {
    feedbackMutation.mutate({ message: values.message.trim() });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const isSubmitShortcut =
      (event.metaKey || event.ctrlKey) && event.key === "Enter";

    if (feedbackMutation.isPending || !isSubmitShortcut) return;

    event.preventDefault();
    form.handleSubmit(onSubmit)();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            Feedback
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Share any thoughts or issues. Your message goes straight to our
            founders.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      minLength={1}
                      maxLength={2000}
                      onKeyDown={handleKeyDown}
                      placeholder="Tell us what's on your mind"
                      className="min-h-[160px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={feedbackMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!trimmedMessage || feedbackMutation.isPending}
              >
                {feedbackMutation.isPending ? "Sending..." : "Send feedback"}
                {!feedbackMutation.isPending ? (
                  <>
                    <span
                      className="ml-2 inline-flex items-center gap-1 text-xs opacity-85"
                      aria-hidden
                    >
                      <kbd className="inline-flex items-center justify-center rounded border border-input bg-muted/20 px-1 py-0.5 h-5 min-w-5 font-sans  leading-none h-5 uppercase">
                        {isMac ? "⌘" : "^"}
                      </kbd>
                      <kbd className="inline-flex items-center justify-center rounded border border-input bg-muted/20 px-1 py-0.5 pt-1 h-5 min-w-5 leading-none font-sans h-5 uppercase">
                        ↵
                      </kbd>
                    </span>
                    <span className="sr-only">
                      {isMac ? "Command" : "Control"} plus Enter
                    </span>
                  </>
                ) : null}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
