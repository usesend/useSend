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
import BulkUploadContacts from "./bulk-upload-contacts";
import ContactList from "./contact-list";
import { formatDistanceToNow } from "date-fns";
import EmojiPicker, { Theme } from "emoji-picker-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import { Button } from "@usesend/ui/src/button";
import { Switch } from "@usesend/ui/src/switch";
import { useTheme } from "@usesend/ui";
import { use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";
import {
  Users,
  MailX,
  Clock,
  Hash,
  Calendar,
  Megaphone,
  Shield,
  ChevronRight,
} from "lucide-react";

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
          <BulkUploadContacts contactBookId={contactBookId} />
          <AddContact contactBookId={contactBookId} />
        </div>
      </div>

      <div className="mt-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Metrics Card */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-muted rounded-md">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-sm font-medium">Metrics</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Total Contacts
                </span>
                <span className="text-lg font-semibold font-mono">
                  {contactBookDetailQuery.data?.totalContacts !== undefined
                    ? contactBookDetailQuery.data?.totalContacts.toLocaleString()
                    : "--"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <MailX className="w-3.5 h-3.5" />
                  Unsubscribed
                </span>
                <span className="text-lg font-semibold font-mono text-destructive">
                  {contactBookDetailQuery.data?.unsubscribedContacts !==
                  undefined
                    ? contactBookDetailQuery.data?.unsubscribedContacts.toLocaleString()
                    : "--"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Details Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-muted rounded-md">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-sm font-medium">Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Contact book ID</p>
                <TextWithCopyButton
                  value={contactBookId}
                  alwaysShowCopy
                  className="text-sm font-mono bg-muted px-2 py-1 rounded w-full"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Created
                </p>
                <p className="text-sm">
                  {contactBookDetailQuery.data?.createdAt
                    ? formatDistanceToNow(
                        contactBookDetailQuery.data.createdAt,
                        {
                          addSuffix: true,
                        },
                      )
                    : "--"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Variables</p>
                <div className="flex flex-wrap gap-1">
                  {(contactBookDetailQuery.data?.variables ?? []).length > 0 ? (
                    contactBookDetailQuery.data?.variables.map((variable) => (
                      <span
                        key={variable}
                        className="font-mono text-xs bg-muted px-2 py-0.5 rounded"
                      >
                        {variable}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Campaigns Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-muted rounded-md">
                  <Megaphone className="w-4 h-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-sm font-medium">
                  Recent Campaigns
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!contactBookDetailQuery.isLoading &&
              contactBookDetailQuery.data?.campaigns.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4 text-center">
                  No campaigns yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {contactBookDetailQuery.data?.campaigns
                    .slice(0, 5)
                    .map((campaign) => (
                      <Link
                        key={campaign.id}
                        href={`/campaigns/${campaign.id}`}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Megaphone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate">
                            {campaign.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(campaign.createdAt, {
                              addSuffix: true,
                            })}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    ))}
                  {(contactBookDetailQuery.data?.campaigns.length || 0) > 5 && (
                    <Link
                      href="/campaigns"
                      className="flex items-center justify-center p-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View all campaigns
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Double Opt-in Section */}
        <Card className="mt-6">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-md">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium">
                    Double Opt-in
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Require email confirmation for new contacts
                  </p>
                </div>
              </div>
              <Switch
                checked={
                  contactBookDetailQuery.data?.doubleOptInEnabled ?? false
                }
                onCheckedChange={(checked) => {
                  updateContactBookMutation.mutate({
                    contactBookId,
                    doubleOptInEnabled: checked,
                  });
                }}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {contactBookDetailQuery.data?.doubleOptInEnabled
                  ? "New contacts will receive a confirmation email before being added to this list."
                  : "New contacts will be immediately added to this list without confirmation."}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/contacts/${contactBookId}/double-opt-in`}>
                  {contactBookDetailQuery.data?.doubleOptInEnabled
                    ? "Edit confirmation email"
                    : "Preview confirmation email"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10">
        <ContactList
          contactBookId={contactBookId}
          contactBookName={contactBookDetailQuery.data?.name}
          doubleOptInEnabled={contactBookDetailQuery.data?.doubleOptInEnabled}
          contactBookVariables={contactBookDetailQuery.data?.variables}
        />
      </div>
    </div>
  );
}
