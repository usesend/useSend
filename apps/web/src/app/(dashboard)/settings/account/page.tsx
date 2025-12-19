"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@usesend/ui/src/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Separator } from "@usesend/ui/src/separator";
import { Skeleton } from "@usesend/ui/src/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@usesend/ui/src/avatar";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";
import { passwordSchema } from "~/server/password-utils";
import { CheckCircle2, Github, Mail } from "lucide-react";

// Schema for changing password (user already has a password)
const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// Schema for setting password (OAuth-only user)
const setPasswordFormSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
type SetPasswordFormValues = z.infer<typeof setPasswordFormSchema>;

// Provider display configuration
const providerConfig: Record<
  string,
  { name: string; icon: React.ReactNode; color: string }
> = {
  github: {
    name: "GitHub",
    icon: <Github className="h-5 w-5" />,
    color: "bg-gray-900 dark:bg-gray-700",
  },
  google: {
    name: "Google",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 488 512"
        className="h-5 w-5 fill-current"
      >
        <path d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
      </svg>
    ),
    color: "bg-white dark:bg-gray-200",
  },
};

function ChangePasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const changePasswordMutation = api.user.changePassword.useMutation();

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: ChangePasswordFormValues) {
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success("Password changed successfully");
      form.reset();
      onSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to change password";
      toast.error(message);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter your current password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter your new password"
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-xs">
                At least 8 characters with uppercase, lowercase, and number
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm New Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Confirm your new password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={changePasswordMutation.isPending}
            isLoading={changePasswordMutation.isPending}
          >
            Change Password
          </Button>
        </div>
      </form>
    </Form>
  );
}

function SetPasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const setPasswordMutation = api.user.setPassword.useMutation();
  const utils = api.useUtils();

  const form = useForm<SetPasswordFormValues>({
    resolver: zodResolver(setPasswordFormSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: SetPasswordFormValues) {
    try {
      await setPasswordMutation.mutateAsync({
        newPassword: values.newPassword,
      });
      toast.success("Password set successfully. You can now sign in with email and password.");
      form.reset();
      await utils.user.hasPassword.invalidate();
      onSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to set password";
      toast.error(message);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter a password"
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-xs">
                At least 8 characters with uppercase, lowercase, and number
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Confirm your password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={setPasswordMutation.isPending}
            isLoading={setPasswordMutation.isPending}
          >
            Set Password
          </Button>
        </div>
      </form>
    </Form>
  );
}

function LinkedAccountsSection({ providers }: { providers: string[] }) {
  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No OAuth accounts linked. You can link accounts by signing in with them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const config = providerConfig[provider.toLowerCase()];
        return (
          <div
            key={provider}
            className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-md ${config?.color || "bg-gray-500"}`}
              >
                {config?.icon || <Mail className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-medium">{config?.name || provider}</p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
        );
      })}
    </div>
  );
}

function ProfileSection({
  profile,
}: {
  profile: { name: string | null; email: string | null; image: string | null };
}) {
  const initials =
    profile.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || profile.email?.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        <AvatarImage src={profile.image || undefined} alt={profile.name || "User"} />
        <AvatarFallback className="text-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        {profile.name && (
          <p className="font-medium text-lg">{profile.name}</p>
        )}
        <p className="text-sm text-muted-foreground">{profile.email}</p>
      </div>
    </div>
  );
}

export default function AccountSettingsPage() {
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const { data: profile, isLoading: profileLoading } =
    api.user.getProfile.useQuery();
  const { data: hasPasswordData, isLoading: hasPasswordLoading } =
    api.user.hasPassword.useQuery();
  const { data: linkedAccounts, isLoading: linkedAccountsLoading } =
    api.user.getLinkedAccounts.useQuery();

  const isLoading = profileLoading || hasPasswordLoading || linkedAccountsLoading;
  const hasPassword = hasPasswordData?.hasPassword ?? false;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Info Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          {profile && (
            <ProfileSection
              profile={{
                name: profile.name,
                email: profile.email,
                image: profile.image,
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Linked Accounts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Linked Accounts</CardTitle>
          <CardDescription>
            OAuth providers connected to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LinkedAccountsSection providers={linkedAccounts || []} />
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            {hasPassword
              ? "Manage your password for email/password sign in"
              : "Set up a password to enable email/password sign in"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPassword ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-green-100 dark:bg-green-900">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Password is set</p>
                    <p className="text-xs text-muted-foreground">
                      You can sign in with email and password
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                >
                  {showPasswordForm ? "Cancel" : "Change Password"}
                </Button>
              </div>

              {showPasswordForm && (
                <>
                  <Separator />
                  <ChangePasswordForm
                    onSuccess={() => setShowPasswordForm(false)}
                  />
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900">
                    <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="font-medium">No password set</p>
                    <p className="text-xs text-muted-foreground">
                      Set a password to enable email/password sign in
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                >
                  {showPasswordForm ? "Cancel" : "Set Password"}
                </Button>
              </div>

              {showPasswordForm && (
                <>
                  <Separator />
                  <SetPasswordForm
                    onSuccess={() => setShowPasswordForm(false)}
                  />
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
