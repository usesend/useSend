"use client";

import { Button } from "@usesend/ui/src/button";
import { api } from "~/trpc/react";
import React from "react";
import { Domain } from "@prisma/client";
import { toast } from "@usesend/ui/src/toaster";
import { SendHorizonal } from "lucide-react";
// Removed dialog and example code. Clicking the button now sends the email directly.

export const SendTestMail: React.FC<{ domain: Domain }> = ({ domain }) => {
  const sendTestEmailFromDomainMutation =
    api.domain.sendTestEmailFromDomain.useMutation();

  const utils = api.useUtils();

  function handleSendTestEmail() {
    sendTestEmailFromDomainMutation.mutate(
      {
        id: domain.id,
      },
      {
        onSuccess: () => {
          utils.domain.domains.invalidate();
          toast.success(`Test email sent`);
        },
        onError: (err) => {
          toast.error(err.message || "Failed to send test email");
        },
      },
    );
  }

  return (
    <Button
      onClick={handleSendTestEmail}
      disabled={sendTestEmailFromDomainMutation.isPending}
    >
      <SendHorizonal className="h-4 w-4 mr-2" />
      {sendTestEmailFromDomainMutation.isPending
        ? "Sending email..."
        : "Send test email"}
    </Button>
  );
};

export default SendTestMail;
