"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@usesend/ui/src/alert-dialog";
import { RefreshCw } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { useRouter } from "next/navigation";

interface ResendEmailProps {
  emailId: string;
}

export default function ResendEmail({ emailId }: ResendEmailProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const utils = api.useUtils();

  const resendMutation = api.email.resendEmail.useMutation({
    onSuccess: (data) => {
      toast.success("Email queued for resending");
      utils.email.getEmail.invalidate({ id: emailId });
      setOpen(false);
      // Navigate to the new email
      router.push(`/emails?emailId=${data.newEmailId}`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to resend email");
    },
  });

  const handleResend = () => {
    resendMutation.mutate({ id: emailId });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Resend
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resend Email</AlertDialogTitle>
          <AlertDialogDescription>
            This will create a new email with the same content and queue it for
            sending. The original email will remain unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleResend}
            disabled={resendMutation.isPending}
          >
            {resendMutation.isPending ? "Resending..." : "Resend Email"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
