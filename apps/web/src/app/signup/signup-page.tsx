"use client";

import { Button } from "@usesend/ui/src/button";
import Image from "next/image";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { ClientSafeProvider, LiteralUnion, signIn } from "next-auth/react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Input } from "@usesend/ui/src/input";
import { BuiltInProviderType } from "next-auth/providers/index";
import Spinner from "@usesend/ui/src/spinner";
import Link from "next/link";
import { useSearchParams as useNextSearchParams, useRouter } from "next/navigation";
import { signupSchema } from "~/server/password-utils";

const providerSvgs = {
  github: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 496 512"
      className="h-5 w-5 fill-primary-foreground"
    >
      <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z" />
    </svg>
  ),
  google: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 488 512"
      className="h-5 w-5 fill-primary-foreground"
    >
      <path d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
    </svg>
  ),
};

// Extended schema with confirm password for client-side validation
const signupFormSchema = signupSchema.extend({
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignupFormValues = z.infer<typeof signupFormSchema>;

export default function SignupPage({
  providers,
}: {
  providers?: ClientSafeProvider[];
}) {
  const router = useRouter();
  const searchParams = useNextSearchParams();
  const inviteId = searchParams.get("inviteId");

  const [signupStatus, setSignupStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [submittedProvider, setSubmittedProvider] =
    useState<LiteralUnion<BuiltInProviderType> | null>(null);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: SignupFormValues) {
    setSignupStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          name: values.name || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSignupStatus("error");
        setErrorMessage(data.error || "Something went wrong");
        return;
      }

      setSignupStatus("success");

      // Auto-login with credentials after successful signup
      const signInResult = await signIn("credentials", {
        email: values.email.toLowerCase(),
        password: values.password,
        redirect: false,
      });

      if (signInResult?.ok) {
        const callbackUrl = inviteId
          ? `/join-team?inviteId=${inviteId}`
          : "/dashboard";
        router.push(callbackUrl);
      } else {
        // If auto-login fails, redirect to login page
        router.push("/login?message=Account created successfully. Please sign in.");
      }
    } catch {
      setSignupStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  }

  const handleOAuthSubmit = (provider: LiteralUnion<BuiltInProviderType>) => {
    setSubmittedProvider(provider);
    const callbackUrl = inviteId
      ? `/join-team?inviteId=${inviteId}`
      : "/dashboard";
    signIn(provider, { callbackUrl });
  };

  const oauthProviders = providers?.filter((p) => p.type !== "email" && p.type !== "credentials");

  return (
    <main className="min-h-screen flex justify-center items-center py-8">
      <div className="flex flex-col gap-6">
        <Image
          src="/logo-squircle.png"
          alt="useSend"
          width={50}
          height={50}
          className="mx-auto"
        />
        <div>
          <p className="text-2xl text-center font-semibold">
            Create new account
          </p>
          <p className="text-center mt-2 text-sm text-muted-foreground">
            Already have an account?
            <Link
              href="/login"
              className="text-foreground hover:underline ml-1"
            >
              Sign in
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-6 mt-4 border p-8 rounded-lg shadow">
          {/* OAuth Buttons */}
          {oauthProviders && oauthProviders.length > 0 && (
            <>
              {oauthProviders.map((provider) => (
                <Button
                  key={provider.id}
                  className="w-[350px]"
                  size="lg"
                  onClick={() => handleOAuthSubmit(provider.id)}
                >
                  {submittedProvider === provider.id ? (
                    <Spinner className="w-5 h-5" />
                  ) : (
                    providerSvgs[provider.id as keyof typeof providerSvgs]
                  )}
                  <span className="ml-4">Sign up with {provider.name}</span>
                </Button>
              ))}

              {/* Divider */}
              <div className="flex w-[350px] items-center justify-between gap-2">
                <p className="z-10 ml-[175px] -translate-x-1/2 bg-background px-4 text-sm">
                  or
                </p>
                <div className="absolute h-[1px] w-[350px] bg-gradient-to-l from-zinc-300 via-zinc-800 to-zinc-300"></div>
              </div>
            </>
          )}

          {/* Signup Form */}
          {signupStatus === "success" ? (
            <div className="w-[350px] text-center">
              <p className="text-green-600 dark:text-green-400 font-medium">
                Account created successfully!
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Redirecting you to the dashboard...
              </p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Name Field (Optional) */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John Doe"
                          className="w-[350px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email Field */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          className="w-[350px]"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password Field */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your password"
                          className="w-[350px]"
                          type="password"
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

                {/* Confirm Password Field */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Confirm your password"
                          className="w-[350px]"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Error Message */}
                {errorMessage && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {errorMessage}
                  </p>
                )}

                {/* Submit Button */}
                <Button
                  className="w-[350px] mt-2"
                  size="lg"
                  type="submit"
                  disabled={signupStatus === "submitting"}
                >
                  {signupStatus === "submitting" ? (
                    <>
                      <Spinner className="w-5 h-5 mr-2" />
                      Creating account...
                    </>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>
            </Form>
          )}
        </div>
      </div>
    </main>
  );
}
