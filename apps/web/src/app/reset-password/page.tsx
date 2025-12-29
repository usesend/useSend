"use client";

import { Button } from "@usesend/ui/src/button";
import Image from "next/image";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, Suspense } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Input } from "@usesend/ui/src/input";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { passwordSchema } from "~/server/password-utils";

const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  const form = useForm<z.infer<typeof resetPasswordFormSchema>>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: z.infer<typeof resetPasswordFormSchema>) {
    if (!token) {
      setErrorMessage("Invalid reset link");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || "Something went wrong");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (!token) {
    return (
      <main className="h-screen flex justify-center items-center">
        <div className="flex flex-col gap-6">
          <Image
            src={"/logo-squircle.png"}
            alt="useSend"
            width={50}
            height={50}
            className="mx-auto"
          />
          <div className="flex flex-col gap-8 mt-8 border p-8 rounded-lg shadow w-[400px]">
            <div className="text-center">
              <p className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
                Invalid Reset Link
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                This password reset link is invalid or has expired.
              </p>
              <Link href="/forgot-password">
                <Button variant="outline" className="w-full">
                  Request a new link
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen flex justify-center items-center">
      <div className="flex flex-col gap-6">
        <Image
          src={"/logo-squircle.png"}
          alt="useSend"
          width={50}
          height={50}
          className="mx-auto"
        />
        <div>
          <p className="text-2xl text-center font-semibold">
            Create new password
          </p>
          <p className="text-center mt-2 text-sm text-muted-foreground">
            Enter a new password for your account
          </p>
        </div>

        <div className="flex flex-col gap-8 mt-8 border p-8 rounded-lg shadow">
          {status === "success" ? (
            <div className="w-[350px] text-center">
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Your password has been reset successfully.
                </p>
              </div>
              <Link href="/login">
                <Button className="w-full">Sign in</Button>
              </Link>
            </div>
          ) : (
            <>
              {status === "error" && errorMessage && (
                <div className="w-[350px] p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {errorMessage}
                  </p>
                </div>
              )}
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter new password"
                            className="w-[350px]"
                            type="password"
                            {...field}
                          />
                        </FormControl>
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
                            placeholder="Confirm new password"
                            className="w-[350px]"
                            type="password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    className="w-[350px]"
                    size="lg"
                    disabled={status === "sending"}
                  >
                    {status === "sending" ? "Resetting..." : "Reset password"}
                  </Button>
                </form>
              </Form>
              <p className="text-center text-sm text-muted-foreground">
                <Link
                  href="/login"
                  className="text-foreground hover:underline"
                >
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="h-screen flex justify-center items-center">
          <div className="flex flex-col gap-6">
            <Image
              src={"/logo-squircle.png"}
              alt="useSend"
              width={50}
              height={50}
              className="mx-auto"
            />
            <p className="text-center text-muted-foreground">Loading...</p>
          </div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
