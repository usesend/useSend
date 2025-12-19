"use client";

import { Button } from "@usesend/ui/src/button";
import Image from "next/image";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@usesend/ui/src/form";
import { Input } from "@usesend/ui/src/input";
import Link from "next/link";

const emailSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email({ message: "Invalid email" }),
});

export default function ForgotPasswordPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "success">("idle");

  const form = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
  });

  async function onSubmit(values: z.infer<typeof emailSchema>) {
    setStatus("sending");
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      // Always show success to prevent email enumeration
      setStatus("success");
    } catch {
      // Still show success to prevent email enumeration
      setStatus("success");
    }
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
            Reset your password
          </p>
          <p className="text-center mt-2 text-sm text-muted-foreground">
            Remember your password?
            <Link
              href="/login"
              className="text-foreground hover:underline ml-1"
            >
              Sign in
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-8 mt-8 border p-8 rounded-lg shadow">
          {status === "success" ? (
            <div className="w-[350px] text-center">
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  If an account exists with that email, we've sent you a
                  password reset link. Please check your inbox.
                </p>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Didn't receive the email? Check your spam folder or try again.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStatus("idle");
                  form.reset();
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <p className="w-[350px] text-center text-sm text-muted-foreground">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            placeholder="Enter your email"
                            className="w-[350px]"
                            type="email"
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
                    {status === "sending" ? "Sending..." : "Send reset link"}
                  </Button>
                </form>
              </Form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
