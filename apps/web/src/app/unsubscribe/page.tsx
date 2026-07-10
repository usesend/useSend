import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  getContactFromUnsubscribeLink,
  unsubscribeContactFromLink,
} from "~/server/service/campaign-service";
import ReSubscribe from "./re-subscribe";
import UnsubscribeButton from "./unsubscribe-button";

export const dynamic = "force-dynamic";

const PUBLIC_UNSUBSCRIBE_ERRORS = new Set([
  "Invalid unsubscribe link",
  "Contact not found",
]);

function getUnsubscribeErrorMessage(error: unknown) {
  if (error instanceof Error && PUBLIC_UNSUBSCRIBE_ERRORS.has(error.message)) {
    return error.message;
  }

  return "Unable to unsubscribe. Please try again.";
}

function buildUnsubscribeUrl({
  id,
  hash,
  status,
  error,
}: {
  id?: string;
  hash?: string;
  status?: "error";
  error?: string;
}) {
  const searchParams = new URLSearchParams();

  if (id) searchParams.set("id", id);
  if (hash) searchParams.set("hash", hash);
  if (status) searchParams.set("status", status);
  if (error) searchParams.set("error", error);

  const queryString = searchParams.toString();
  return queryString ? `/unsubscribe?${queryString}` : "/unsubscribe";
}

async function unsubscribeAction(formData: FormData) {
  "use server";

  const id = formData.get("id");
  const hash = formData.get("hash");

  if (typeof id !== "string" || typeof hash !== "string") {
    redirect(
      buildUnsubscribeUrl({
        status: "error",
        error: "Invalid unsubscribe link",
      }),
    );
  }

  let redirectUrl: string;

  try {
    await unsubscribeContactFromLink(id, hash);
    redirectUrl = buildUnsubscribeUrl({ id, hash });
  } catch (error) {
    redirectUrl = buildUnsubscribeUrl({
      id,
      hash,
      status: "error",
      error: getUnsubscribeErrorMessage(error),
    });
  }

  redirect(redirectUrl);
}

function MessageCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="w-full max-w-md space-y-4 rounded-xl border p-8 shadow">
      <h1 className="text-center text-2xl font-semibold">{title}</h1>
      <p className="text-center text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const getSingleValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const params = await searchParams;
  const id = getSingleValue(params.id);
  const hash = getSingleValue(params.hash);
  const status = getSingleValue(params.status);
  const error = getSingleValue(params.error);

  let content: ReactNode;

  if (!id || !hash) {
    content = (
      <MessageCard
        title="Invalid Link"
        message="This unsubscribe link is invalid. Please check the URL and try again."
      />
    );
  } else {
    try {
      const contact = await getContactFromUnsubscribeLink(id, hash);

      if (!contact.subscribed) {
        content = <ReSubscribe id={id} hash={hash} contact={contact} />;
      } else {
        content = (
          <div className="w-full max-w-md space-y-6 rounded-xl border p-8 shadow">
            <div className="space-y-2">
              <h1 className="text-center text-2xl font-semibold">
                Unsubscribe
              </h1>
              <p className="text-center text-sm text-muted-foreground">
                Are you sure you want to stop receiving emails at{" "}
                <span className="font-medium text-foreground">
                  {contact.email}
                </span>
                ?
              </p>
            </div>

            {status === "error" ? (
              <p role="alert" className="text-center text-sm text-destructive">
                {getUnsubscribeErrorMessage(error ? new Error(error) : null)}
              </p>
            ) : null}

            <form action={unsubscribeAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="hash" value={hash} />
              <UnsubscribeButton />
            </form>
          </div>
        );
      }
    } catch (linkError) {
      content = (
        <MessageCard
          title="Invalid Link"
          message={getUnsubscribeErrorMessage(linkError)}
        />
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {content}

      <div className="fixed bottom-10 p-4 text-sm">
        <p>
          Powered by{" "}
          <a
            href="https://usesend.com"
            className="font-bold"
            target="_blank"
            rel="noreferrer"
          >
            useSend
          </a>
        </p>
      </div>
    </main>
  );
}
