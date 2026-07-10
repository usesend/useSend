"use client";

import { Button } from "@usesend/ui/src/button";
import { useFormStatus } from "react-dom";

export default function UnsubscribeButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="destructive"
      className="min-h-11 w-full touch-manipulation"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Unsubscribing…" : "Confirm unsubscribe"}
    </Button>
  );
}
