import { confirmDoubleOptInSubscription } from "~/server/service/double-opt-in-service";

export const dynamic = "force-dynamic";

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

  if (!contactId || !expiresAt || !hash) {
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

  try {
    const contact = await confirmDoubleOptInSubscription({
      contactId,
      expiresAt,
      hash,
    });

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 p-8 shadow rounded-xl border">
          <h1 className="text-2xl font-semibold text-center">
            Subscription Confirmed
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            {contact.email} is now subscribed and will receive future emails.
          </p>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 p-8 shadow rounded-xl border">
          <h1 className="text-2xl font-semibold text-center">
            Confirmation Failed
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            {error instanceof Error
              ? error.message
              : "Unable to confirm your subscription."}
          </p>
        </div>
      </div>
    );
  }
}
