"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { SuppressionReason } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usesend/ui/src/dialog";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Label } from "@usesend/ui/src/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";

interface AddSuppressionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddSuppressionDialog({
  open,
  onOpenChange,
}: AddSuppressionDialogProps) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<SuppressionReason>(
    SuppressionReason.MANUAL
  );
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();

  const addMutation = api.suppression.addSuppression.useMutation({
    onSuccess: () => {
      utils.suppression.getSuppressions.invalidate();
      utils.suppression.getSuppressionStats.invalidate();
      handleClose();
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const checkMutation = api.suppression.checkSuppression.useQuery(
    { email: email.trim() },
    {
      enabled: false,
    }
  );

  const handleClose = () => {
    setEmail("");
    setReason(SuppressionReason.MANUAL);
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Email address is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    // Check if already suppressed
    try {
      const { data: isAlreadySuppressed } = await checkMutation.refetch();
      if (isAlreadySuppressed) {
        setError("This email is already suppressed");
        return;
      }
    } catch (error) {
      // Continue with addition if check fails
    }

    addMutation.mutate({
      email: trimmedEmail,
      reason,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Email Suppression</DialogTitle>
          <DialogDescription>
            Add an email address to the suppression list to prevent future
            emails from being sent to it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="example@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={addMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as SuppressionReason)}
              disabled={addMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual</SelectItem>
                <SelectItem value="HARD_BOUNCE">Hard Bounce</SelectItem>
                <SelectItem value="COMPLAINT">Complaint</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={addMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={addMutation.isPending || !email.trim()}
            >
              {addMutation.isPending ? "Adding..." : "Add Suppression"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
