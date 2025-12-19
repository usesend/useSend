import { redirect } from "next/navigation";
import { getServerAuthSession } from "~/server/auth";
import SignupPage from "./signup-page";
import { getProviders } from "next-auth/react";

export default async function Signup() {
  const session = await getServerAuthSession();

  if (session) {
    redirect("/dashboard");
  }

  const providers = await getProviders();

  return <SignupPage providers={Object.values(providers ?? {})} />;
}
