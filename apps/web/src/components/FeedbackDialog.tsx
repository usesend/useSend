"use client";

import { useState } from "react";
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
import { Label } from "@usesend/ui/src/label";
import { Textarea } from "@usesend/ui/src/textarea";
import { toast } from "@usesend/ui/src/toaster";

import { api } from "~/trpc/react";

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const feedbackMutation = api.feedback.send.useMutation({
    onSuccess: () => {
      toast.success("Thanks for sharing your feedback!");
      setMessage("");
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const trimmedMessage = message.trim();

  function handleSubmit() {
    if (!trimmedMessage) return;

    feedbackMutation.mutate({ message: trimmedMessage });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Share any thoughts or issues. Your message goes straight to our founders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="feedback-message">Feedback</Label>
          <Textarea
            id="feedback-message"
            minLength={1}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell us what&apos;s on your mind"
            className="min-h-[160px]"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={feedbackMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!trimmedMessage || feedbackMutation.isPending}
          >
            {feedbackMutation.isPending ? "Sending..." : "Send feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
