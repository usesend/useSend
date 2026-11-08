import { Rocket } from "lucide-react";

import { getServerAuthSession } from "~/server/auth";
import { db } from "~/server/db";
import { WaitListForm } from "./waitlist-form";
import { redirect } from "next/navigation";

export default async function WaitListPage() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  const userEmail = session.user.email ?? "";
  const application = await db.waitlistApplication.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-lg border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-primary/10 p-2 text-primary">
            <Rocket className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">You're on the waitlist</h1>
            <p className="text-sm text-muted-foreground">
              Share a bit more context so we can prioritize your access.
            </p>
          </div>
        </div>

        {application ? (
          <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
            <p className="font-medium">We got your application.</p>
            <p className="mt-1 text-muted-foreground">
              We&apos;ll email you at {userEmail} once we&apos;ve reviewed it.
              You can update your answers below.
            </p>
          </div>
        ) : null}

        <WaitListForm
          userEmail={userEmail}
          initialValues={
            application
              ? {
                  website: application.website,
                  domain: application.domain,
                  emailTypes: application.emailTypes.filter(
                    (type): type is "transactional" | "marketing" =>
                      type === "transactional" || type === "marketing",
                  ),
                  emailVolume: application.emailVolume,
                  listSource: application.listSource,
                  description: application.description,
                }
              : undefined
          }
          isUpdate={Boolean(application)}
        />
      </div>
    </div>
  );
}
