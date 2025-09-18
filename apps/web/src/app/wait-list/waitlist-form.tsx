"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@usesend/ui/src/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Input } from "@usesend/ui/src/input";
import { Textarea } from "@usesend/ui/src/textarea";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";

import {
  WAITLIST_EMAIL_TYPES,
  waitlistSubmissionSchema,
  type WaitlistSubmissionInput,
} from "./schema";
import { api } from "~/trpc/react";
import { signOut } from "next-auth/react";

type WaitListFormProps = {
  userEmail: string;
};

const EMAIL_TYPE_LABEL: Record<(typeof WAITLIST_EMAIL_TYPES)[number], string> = {
  transactional: "Transactional",
  marketing: "Marketing",
};

export function WaitListForm({ userEmail }: WaitListFormProps) {
  const form = useForm<WaitlistSubmissionInput>({
    resolver: zodResolver(waitlistSubmissionSchema),
    defaultValues: {
      domain: "",
      emailTypes: [],
      description: "",
    },
  });

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const submitRequest = api.waitlist.submitRequest.useMutation({
    onSuccess: () => {
      toast.success("Thanks! We'll reach out shortly.");
      form.reset();
    },
    onError: (error) => {
      toast.error(error.message ?? "Something went wrong");
    },
  });

  const onSubmit = (values: WaitlistSubmissionInput) => {
    submitRequest.mutate(values);
  };

  const handleLogout = () => {
    setIsLoggingOut(true);
    signOut({ callbackUrl: "/login" }).catch(() => {
      setIsLoggingOut(false);
      toast.error("Unable to log out. Please try again.");
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        <FormField
          control={form.control}
          name="domain"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Primary domain</FormLabel>
              <FormControl>
                <Input
                  placeholder="acme.com"
                  autoComplete="off"
                  {...field}
                  value={field.value}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <p className="text-sm font-medium">Contact email</p>
          <p className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {userEmail || "Unknown"}
          </p>
        </div>

        <FormField
          control={form.control}
          name="emailTypes"
          render={({ field }) => {
            const selected = field.value ?? [];
            const handleToggle = (
              option: (typeof WAITLIST_EMAIL_TYPES)[number]
            ) => {
              if (selected.includes(option)) {
                field.onChange(selected.filter((value) => value !== option));
              } else {
                field.onChange([...selected, option]);
              }
            };

            return (
              <FormItem>
                <FormLabel>What emails do you plan to send?</FormLabel>
                <FormControl>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {WAITLIST_EMAIL_TYPES.map((option) => {
                      const checked = selected.includes(option);
                      return (
                        <label
                          key={option}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm transition hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-muted-foreground/40"
                            checked={checked}
                            onChange={() => handleToggle(option)}
                          />
                          <span>{EMAIL_TYPE_LABEL[option]}</span>
                        </label>
                      );
                    })}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What kind of emails will you send?</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Share a quick summary so we can prioritize your access"
                  {...field}
                  value={field.value}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            We'll come back usually within 4 hours.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Logging out...
                </>
              ) : (
                "Log out"
              )}
            </Button>
            <Button type="submit" disabled={submitRequest.isPending}>
              {submitRequest.isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Sending...
                </>
              ) : (
                "Request Access"
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
