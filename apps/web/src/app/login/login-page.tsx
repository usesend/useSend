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
  FormMessage,
} from "@usesend/ui/src/form";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS_AND_CHARS,
} from "@usesend/ui/src/input-otp";
import { Input } from "@usesend/ui/src/input";
import { BuiltInProviderType } from "next-auth/providers/index";
import Spinner from "@usesend/ui/src/spinner";
import Link from "next/link";
import { useTheme } from "@usesend/ui";
import { useSearchParams as useNextSearchParams } from "next/navigation";

const emailSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email({ message: "Invalid email" }),
});

const otpSchema = z.object({
  otp: z
    .string({ required_error: "OTP is required" })
    .length(5, { message: "Invalid OTP" }),
});

const providerSvgs = {
  github: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 496 512"
      className="h-5 w-5  fill-primary-foreground "
    >
      <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z" />
    </svg>
  ),
  google: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 488 512"
      className="h-5 w-5  fill-primary-foreground"
    >
      <path d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
    </svg>
  ),
};

export default function LoginPage({
  providers,
  isSignup = false,
}: {
  providers?: ClientSafeProvider[];
  isSignup?: boolean;
}) {
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "sending" | "success"
  >("idle");

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
  });

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
  });

  async function onEmailSubmit(values: z.infer<typeof emailSchema>) {
    setEmailStatus("sending");
    await signIn("email", {
      email: values.email.toLowerCase(),
      redirect: false,
    });
    setEmailStatus("success");
  }

  async function onOTPSubmit(values: z.infer<typeof otpSchema>) {
    const { origin: callbackUrl } = window.location;
    const email = emailForm.getValues().email;
    console.log("email", email);

    const finalCallbackUrl = inviteId
      ? `/join-team?inviteId=${inviteId}`
      : `${callbackUrl}/dashboard`;
    window.location.href = `/api/auth/callback/email?email=${encodeURIComponent(
      email.toLowerCase()
    )}&token=${values.otp.toLowerCase()}&callbackUrl=${encodeURIComponent(finalCallbackUrl)}`;
  }

  const emailProvider = providers?.find(
    (provider) => provider.type === "email"
  );

  const [submittedProvider, setSubmittedProvider] =
    useState<LiteralUnion<BuiltInProviderType> | null>(null);

  const searchParams = useNextSearchParams();
  const inviteId = searchParams.get("inviteId");

  const handleSubmit = (provider: LiteralUnion<BuiltInProviderType>) => {
    setSubmittedProvider(provider);
    const callbackUrl = inviteId
      ? `/join-team?inviteId=${inviteId}`
      : "/dashboard";
    signIn(provider, { callbackUrl });
  };

  const { resolvedTheme } = useTheme();

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
            {isSignup ? "Create new account" : "Sign into useSend"}
          </p>
          <p className="text-center mt-2 text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "New to useSend?"}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className=" text-foreground hover:underline ml-1"
            >
              {isSignup ? "Sign in" : "Create new account"}
            </Link>
          </p>
        </div>

        <div className="flex flex-col gap-8 mt-8 border p-8 rounded-lg shadow">
          {providers &&
            Object.values(providers).map((provider) => {
              if (provider.type === "email") return null;
              return (
                <Button
                  key={provider.id}
                  className="w-[350px]"
                  size="lg"
                  onClick={() => handleSubmit(provider.id)}
                >
                  {submittedProvider === provider.id ? (
                    <Spinner className="w-5 h-5" />
                  ) : (
                    providerSvgs[provider.id as keyof typeof providerSvgs]
                  )}
                  <span className="ml-4">
                    {isSignup ? "Sign up with" : "Continue with"}{" "}
                    {provider.name}
                  </span>
                </Button>
              );
            })}
          {emailProvider && (
            <>
              <div className=" flex w-[350px]  items-center justify-between gap-2">
                <p className=" z-10 ml-[175px] -translate-x-1/2 bg-background px-4 text-sm">
                  or
                </p>
                <div className="absolute h-[1px] w-[350px]  bg-gradient-to-l from-zinc-300 via-zinc-800 to-zinc-300"></div>
              </div>
              {emailStatus === "success" ? (
                <>
                  <p className=" w-[350px] text-center text-sm">
                    We have sent an email with the OTP. Please check your inbox
                  </p>
                  <Form {...otpForm}>
                    <form
                      onSubmit={otpForm.handleSubmit(onOTPSubmit)}
                      className=""
                    >
                      <FormField
                        control={otpForm.control}
                        name="otp"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <InputOTP
                                className="w-[350px]"
                                maxLength={5}
                                pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                                inputMode="text"
                                {...field}
                              >
                                <InputOTPGroup>
                                  <InputOTPSlot
                                    className="w-[70px]"
                                    index={0}
                                  />
                                  <InputOTPSlot
                                    className="w-[70px]"
                                    index={1}
                                  />
                                  <InputOTPSlot
                                    className="w-[70px]"
                                    index={2}
                                  />
                                  <InputOTPSlot
                                    className="w-[70px]"
                                    index={3}
                                  />
                                  <InputOTPSlot
                                    className="w-[70px]"
                                    index={4}
                                  />
                                </InputOTPGroup>
                              </InputOTP>
                            </FormControl>

                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button size="lg" className=" mt-9 w-[350px]">
                        Submit
                      </Button>
                    </form>
                  </Form>
                </>
              ) : (
                <>
                  <Form {...emailForm}>
                    <form
                      onSubmit={emailForm.handleSubmit(onEmailSubmit)}
                      className="space-y-6"
                    >
                      <FormField
                        control={emailForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="Enter your email"
                                className=" w-[350px]"
                                type="email"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        className=" w-[350px] "
                        size="lg"
                        disabled={emailStatus === "sending"}
                      >
                        {emailStatus === "sending"
                          ? "Sending..."
                          : "Continue with email"}
                      </Button>
                    </form>
                  </Form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
