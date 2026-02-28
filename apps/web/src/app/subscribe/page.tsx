import { confirmDoubleOptInSubscription } from "~/server/service/double-opt-in-service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PUBLIC_CONFIRMATION_ERRORS = new Set([
  "Invalid confirmation link",
  "Confirmation link has expired",
  "Contact not found",
]);

function getConfirmationErrorMessage(error: unknown) {
  if (error instanceof Error && PUBLIC_CONFIRMATION_ERRORS.has(error.message)) {
    return error.message;
  }

  return "Unable to confirm your subscription.";
}

function buildSubscribeUrl({
  contactId,
  expiresAt,
  hash,
  status,
  error,
}: {
  contactId?: string;
  expiresAt?: string;
  hash?: string;
  status?: "success" | "error";
  error?: string;
}) {
  const searchParams = new URLSearchParams();

  if (contactId) searchParams.set("contactId", contactId);
  if (expiresAt) searchParams.set("expiresAt", expiresAt);
  if (hash) searchParams.set("hash", hash);
  if (status) searchParams.set("status", status);
  if (error) searchParams.set("error", error);

  const queryString = searchParams.toString();
  return queryString ? `/subscribe?${queryString}` : "/subscribe";
}

async function confirmSubscriptionAction(formData: FormData) {
  "use server";

  const contactId = formData.get("contactId");
  const expiresAt = formData.get("expiresAt");
  const hash = formData.get("hash");

  if (
    typeof contactId !== "string" ||
    typeof expiresAt !== "string" ||
    typeof hash !== "string"
  ) {
    redirect(
      buildSubscribeUrl({
        status: "error",
        error: "Invalid confirmation link",
      }),
    );
  }

  let redirectUrl: string;

  try {
    await confirmDoubleOptInSubscription({
      contactId,
      expiresAt,
      hash,
    });

    redirectUrl = buildSubscribeUrl({
      status: "success",
    });
  } catch (error) {
    redirectUrl = buildSubscribeUrl({
      contactId,
      expiresAt,
      hash,
      status: "error",
      error: getConfirmationErrorMessage(error),
    });
  }

  redirect(redirectUrl);
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const getSingleValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const params = await searchParams;
  const contactId = getSingleValue(params.contactId);
  const expiresAt = getSingleValue(params.expiresAt);
  const hash = getSingleValue(params.hash);
  const status = getSingleValue(params.status);
  const error = getSingleValue(params.error);

  const expiresAtTimestamp = Number(expiresAt);
  const hasValidExpiry = Number.isFinite(expiresAtTimestamp);
  const isExpired = hasValidExpiry && Date.now() > expiresAtTimestamp;
  const normalizedError =
    status === "error"
      ? getConfirmationErrorMessage(error ? new Error(error) : null)
      : null;
  const isFatalError =
    normalizedError === "Invalid confirmation link" ||
    normalizedError === "Confirmation link has expired" ||
    normalizedError === "Contact not found";

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 p-8 shadow rounded-xl border">
          <h1 className="text-2xl font-semibold text-center">
            Subscription Confirmed
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Your subscription is confirmed and you will receive future emails.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error" && (!contactId || !expiresAt || !hash)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 p-8 shadow rounded-xl border">
          <h1 className="text-2xl font-semibold text-center">
            Confirmation Failed
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            {normalizedError ?? "Unable to confirm your subscription."}
          </p>
        </div>
      </div>
    );
  }

  if (!contactId || !expiresAt || !hash || !hasValidExpiry) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 p-8 shadow rounded-xl border">
          <h1 className="text-2xl font-semibold text-center">Invalid Link</h1>
          <p className="text-sm text-muted-foreground text-center">
            This confirmation link is invalid. Please request a new one.
          </p>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 p-8 shadow rounded-xl border">
          <h1 className="text-2xl font-semibold text-center">
            Confirmation Failed
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Confirmation link has expired
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4 p-8 shadow rounded-xl border">
        <h1 className="text-2xl font-semibold text-center">
          Confirm Subscription
        </h1>
        <p className="text-sm text-muted-foreground text-center">
          Click the button below to confirm your subscription.
        </p>

        {normalizedError ? (
          <p className="text-sm text-red text-center">{normalizedError}</p>
        ) : null}

        {!isFatalError ? (
          <form action={confirmSubscriptionAction} className="pt-2">
            <input type="hidden" name="contactId" value={contactId} />
            <input type="hidden" name="expiresAt" value={expiresAt} />
            <input type="hidden" name="hash" value={hash} />
            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Confirm subscription
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
