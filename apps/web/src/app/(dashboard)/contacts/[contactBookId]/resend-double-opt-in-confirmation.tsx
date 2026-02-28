"use client";

import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@usesend/ui/src/tooltip";
import { Send } from "lucide-react";
import { useState } from "react";
import { api } from "~/trpc/react";

export function ResendDoubleOptInConfirmation({
  contactBookId,
  contactId,
  email,
}: {
  contactBookId: string;
  contactId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const resendMutation =
    api.contacts.resendDoubleOptInConfirmation.useMutation();

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={resendMutation.isPending}
          >
            {resendMutation.isPending ? (
              <Spinner className="h-4 w-4" innerSvgClass="stroke-primary" />
            ) : (
              <Send className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Resend confirmation email</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resend Confirmation Email</DialogTitle>
            <DialogDescription>
              Send a new double opt-in confirmation email to{" "}
              <strong>{email}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={resendMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                resendMutation.mutate(
                  {
                    contactBookId,
                    contactId,
                  },
                  {
                    onSuccess: async () => {
                      await utils.contacts.contacts.invalidate();
                      toast.success(`Confirmation email resent to ${email}`);
                      setOpen(false);
                    },
                    onError: (error) => {
                      toast.error(error.message);
                    },
                  },
                );
              }}
              disabled={resendMutation.isPending}
            >
              {resendMutation.isPending ? "Resending..." : "Resend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
