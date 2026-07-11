import { redirect } from "next/navigation";
import { getServerAuthSession } from "~/server/auth";
import LoginPage from "./login-page";
import { authProviders } from "~/server/auth";

export default async function Login() {
  const session = await getServerAuthSession();

  if (session) {
    redirect("/dashboard");
  }

  return <LoginPage providers={authProviders} />;
}
