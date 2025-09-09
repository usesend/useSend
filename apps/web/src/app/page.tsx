import { getServerAuthSession } from "~/server/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
