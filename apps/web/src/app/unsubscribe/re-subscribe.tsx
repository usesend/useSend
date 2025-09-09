"use client";

import { Contact } from "@prisma/client";
import { Button } from "@usesend/ui/src/button";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { useState } from "react";
import { api } from "~/trpc/react";

export default function ReSubscribe({
  id,
  hash,
  contact,
}: {
  id: string;
  hash: string;
  contact: Contact;
}) {
  const [subscribed, setSubscribed] = useState(false);

  const reSubscribe = api.campaign.reSubscribeContact.useMutation({
    onSuccess: () => {
      toast.success("You have been subscribed again");
      setSubscribed(true);
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  return (
    <div className="max-w-xl w-full space-y-8 p-10 border shadow rounded-xl">
      <h2 className=" text-center text-xl font-extrabold ">
        {subscribed ? "You have subscribed again" : "You have unsubscribed"}
      </h2>
      <div>
        {subscribed
          ? "You have been added to our mailing list and will receive all emails at"
          : "You have been removed from our mailing list and won't receive any emails at"}{" "}
        <span className="font-bold">{contact.email}</span>.
      </div>

      <div className="flex justify-center">
        {!subscribed ? (
          <Button
            className="mx-auto w-[150px]"
            onClick={() => reSubscribe.mutate({ id, hash })}
            disabled={reSubscribe.isPending}
          >
            {reSubscribe.isPending ? (
              <Spinner className="w-4 h-4" />
            ) : (
              "Subscribe Again"
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
