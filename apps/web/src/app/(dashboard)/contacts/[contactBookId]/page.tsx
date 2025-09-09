"use client";

import { api } from "~/trpc/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@usesend/ui/src/breadcrumb";
import Link from "next/link";
import AddContact from "./add-contact";
import ContactList from "./contact-list";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";
import { formatDistanceToNow } from "date-fns";
import EmojiPicker, { Theme } from "emoji-picker-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { Button } from "@usesend/ui/src/button";
import { useTheme } from "@usesend/ui";
import { use } from "react";

export default function ContactsPage({
  params,
}: {
  params: Promise<{ contactBookId: string }>;
}) {
  const { contactBookId } = use(params);
  const { theme } = useTheme();

  const contactBookDetailQuery = api.contacts.getContactBookDetails.useQuery({
    contactBookId: contactBookId,
  });

  const utils = api.useUtils();

  const updateContactBookMutation = api.contacts.updateContactBook.useMutation({
    onMutate: async (data) => {
      await utils.contacts.getContactBookDetails.cancel();
      utils.contacts.getContactBookDetails.setData(
        {
          contactBookId: contactBookId,
        },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            ...data,
          };
        },
      );
    },
    onSettled: () => {
      utils.contacts.getContactBookDetails.invalidate({
        contactBookId: contactBookId,
      });
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center">
        <div className="flex items-center  gap-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/contacts" className="text-xl">
                    Contact books
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-xl" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            className="p-0 hover:bg-transparent text-lg"
                            type="button"
                          >
                            {contactBookDetailQuery.data?.emoji}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full rounded-none border-0 !bg-transparent !p-0 shadow-none drop-shadow-md">
                          <EmojiPicker
                            onEmojiClick={(emojiObject) => {
                              // Handle emoji selection here
                              // You might want to update the contactBook's emoji
                              updateContactBookMutation.mutate({
                                contactBookId: contactBookId,
                                emoji: emojiObject.emoji,
                              });
                            }}
                            theme={
                              theme === "system"
                                ? Theme.AUTO
                                : theme === "dark"
                                  ? Theme.DARK
                                  : Theme.LIGHT
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    </span>
                    <span className="text-xl">
                      {contactBookDetailQuery.data?.name}
                    </span>
                  </div>
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex gap-4">
          <AddContact contactBookId={contactBookId} />
        </div>
      </div>
      <div className="mt-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <div className="flex flex-col gap-2 rounded-lg border p-4 shadow">
            <p className="font-semibold mb-1">Metrics</p>
            <div className="flex items-center gap-2">
              <div className="text-muted-foreground w-[130px] text-sm">
                Total Contacts
              </div>
              <div className="font-mono text-sm">
                {contactBookDetailQuery.data?.totalContacts !== undefined
                  ? contactBookDetailQuery.data?.totalContacts
                  : "--"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-muted-foreground w-[130px] text-sm">
                Unsubscribed
              </div>
              <div className="font-mono text-sm">
                {contactBookDetailQuery.data?.unsubscribedContacts !== undefined
                  ? contactBookDetailQuery.data?.unsubscribedContacts
                  : "--"}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4 shadow">
            <p className="font-semibold">Details</p>
            <div className="flex items-center gap-2">
              <div className="text-muted-foreground w-[130px] text-sm">
                Contact book ID
              </div>
              <TextWithCopyButton
                value={contactBookId}
                alwaysShowCopy
                className="text-sm w-[130px] overflow-hidden text-ellipsis font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-muted-foreground w-[130px] text-sm">
                Created at
              </div>
              <div className="text-sm">
                {contactBookDetailQuery.data?.createdAt
                  ? formatDistanceToNow(contactBookDetailQuery.data.createdAt, {
                      addSuffix: true,
                    })
                  : "--"}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4 shadow">
            <p className="font-semibold">Recent campaigns</p>
            {!contactBookDetailQuery.isLoading &&
            contactBookDetailQuery.data?.campaigns.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                No campaigns yet.
              </div>
            ) : null}
            {contactBookDetailQuery.data?.campaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-center gap-2">
                <Link href={`/campaigns/${campaign.id}`}>
                  <div className="text-sm hover:underline hover:decoration-dashed text-nowrap w-[200px] overflow-hidden text-ellipsis">
                    {campaign.name}
                  </div>
                </Link>
                <div className="text-muted-foreground text-xs">
                  {formatDistanceToNow(campaign.createdAt, {})}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16">
          <ContactList contactBookId={contactBookId} />
        </div>
      </div>
    </div>
  );
}
