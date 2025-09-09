"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { Input } from "@usesend/ui/src/input";
import { useForm } from "react-hook-form";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
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
import { useTeam } from "~/providers/team-context";
import { isCloud, isSelfHosted } from "~/utils/common";
import { useUpgradeModalStore } from "~/store/upgradeModalStore";
import { LimitReason } from "~/lib/constants/plans";

const inviteTeamMemberSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address"),
  role: z.enum(["ADMIN", "MEMBER"], {
    required_error: "Please select a role",
  }),
});

type FormData = z.infer<typeof inviteTeamMemberSchema>;

export default function InviteTeamMember() {
  const { currentIsAdmin } = useTeam();
  const { data: domains } = api.domain.domains.useQuery();

  const limitsQuery = api.limits.get.useQuery({
    type: LimitReason.TEAM_MEMBER,
  });
  const { openModal } = useUpgradeModalStore((s) => s.action);

  const [open, setOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(inviteTeamMemberSchema),
    defaultValues: {
      email: "",
      role: "MEMBER",
    },
  });

  const utils = api.useUtils();

  const createInvite = api.team.createTeamInvite.useMutation();

  function onSubmit(values: FormData) {
    if (limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    createInvite.mutate(
      {
        email: values.email,
        role: values.role,
        sendEmail: true,
      },
      {
        onSuccess: () => {
          form.reset();
          setOpen(false);
          void utils.team.getTeamInvites.invalidate();
          toast.success("Invitation sent successfully");
        },
        onError: (error) => {
          console.error(error);
          toast.error(error.message || "Failed to send invitation");
        },
      },
    );
  }

  async function onCopyLink() {
    if (limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    createInvite.mutate(
      {
        email: form.getValues("email"),
        role: form.getValues("role"),
        sendEmail: false,
      },
      {
        onSuccess: (invite) => {
          void utils.team.getTeamInvites.invalidate();
          navigator.clipboard.writeText(
            `${location.origin}/join-team?inviteId=${invite.id}`,
          );
          form.reset();
          setOpen(false);
          toast.success("Invitation link copied to clipboard");
        },
        onError: (error) => {
          console.error(error);
          toast.error(error.message || "Failed to copy invitation link");
        },
      },
    );
  }

  function onOpenChange(_open: boolean) {
    if (_open && limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    setOpen(_open);
  }

  if (!currentIsAdmin) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? onOpenChange(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className=" max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 pt-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field, formState }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="colleague@example.com" {...field} />
                  </FormControl>
                  {formState.errors.email ? (
                    <FormMessage />
                  ) : (
                    <FormDescription>
                      Enter your colleague's email address
                    </FormDescription>
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <div className="capitalize">
                          {field.value.toLowerCase()}
                        </div>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ADMIN">
                        <div>Admin</div>
                        <div className="text-xs text-muted-foreground">
                          Manage users, update payments
                        </div>
                      </SelectItem>
                      <SelectItem value="MEMBER">
                        <div>Member</div>
                        <div className="text-xs text-muted-foreground">
                          Manage emails, domains and contacts
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isSelfHosted() && domains?.length ? (
              <div className="text-sm text-muted-foreground">
                Will use{" "}
                <span className="font-bold">hello@{domains[0]?.name}</span> to
                send invitation
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              {isSelfHosted() ? (
                <Button
                  disabled={createInvite.isPending || limitsQuery.isLoading}
                  isLoading={createInvite.isPending}
                  className="w-[150px]"
                  onClick={form.handleSubmit(onCopyLink)}
                >
                  Copy Invitation
                </Button>
              ) : null}
              {isCloud() || domains?.length ? (
                <Button
                  type="submit"
                  disabled={createInvite.isPending || limitsQuery.isLoading}
                  isLoading={createInvite.isPending}
                  className="w-[150px]"
                >
                  Send Invitation
                </Button>
              ) : null}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
