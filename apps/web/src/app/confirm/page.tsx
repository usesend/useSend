import { confirmContactFromLink } from "~/server/service/double-opt-in-service";

export const dynamic = "force-dynamic";

async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const id = params.id as string;
  const hash = params.hash as string;

  if (!id || !hash) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full space-y-8 p-10 shadow rounded-xl">
          <h2 className="mt-6 text-center text-3xl font-extrabold">
            Confirm Subscription
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Invalid confirmation link. Please check your URL and try again.
          </p>
        </div>
      </div>
    );
  }

  try {
    const { confirmed } = await confirmContactFromLink(id, hash);

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full space-y-8 p-10 shadow rounded-xl">
          <h2 className="mt-6 text-center text-3xl font-extrabold">
            Confirm Subscription
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {confirmed
              ? "Your email has been confirmed. Thanks for subscribing!"
              : "We could not confirm your email yet. Please try again later."}
          </p>
        </div>
        <div className="fixed bottom-10 p-4">
          <p>
            Powered by{" "}
            <a href="https://usesend.com" className="font-bold" target="_blank">
              useSend
            </a>
          </p>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full space-y-8 p-10 shadow rounded-xl">
          <h2 className="mt-6 text-center text-3xl font-extrabold">
            Confirm Subscription
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Invalid or expired confirmation link. Please contact the sender for
            a new email.
          </p>
        </div>
        <div className="fixed bottom-10 p-4">
          <p>
            Powered by{" "}
            <a href="https://usesend.com" className="font-bold" target="_blank">
              useSend
            </a>
          </p>
        </div>
      </div>
    );
  }
}

export default ConfirmSubscriptionPage;
