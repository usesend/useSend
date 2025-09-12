"use client";

import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Editor } from "@usesend/email-editor";
import { use, useState } from "react";
import { Campaign } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@usesend/ui/src/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { toast } from "@usesend/ui/src/toaster";
import { useDebouncedCallback } from "use-debounce";
import { formatDistanceToNow } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@usesend/ui/src/accordion";
import ScheduleCampaign from "../../schedule-campaign";

const sendSchema = z.object({
  confirmation: z.string(),
});

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;

export default function EditCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);

  const {
    data: campaign,
    isLoading,
    error,
  } = api.campaign.getCampaign.useQuery(
    { campaignId },
    {
      enabled: !!campaignId,
    }
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-red-500">Failed to load campaign</p>
      </div>
    );
  }

  if (!campaign) {
    return <div>Campaign not found</div>;
  }

  return <CampaignEditor campaign={campaign} />;
}

function CampaignEditor({
  campaign,
}: {
  campaign: Campaign & { imageUploadSupported: boolean };
}) {
  const contactBooksQuery = api.contacts.getContactBooks.useQuery({});
  const utils = api.useUtils();

  const [json, setJson] = useState<Record<string, any> | undefined>(
    campaign.content ? JSON.parse(campaign.content) : undefined
  );
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [from, setFrom] = useState(campaign.from);
  const [contactBookId, setContactBookId] = useState(campaign.contactBookId);
  const [replyTo, setReplyTo] = useState<string | undefined>(
    campaign.replyTo[0]
  );
  const [previewText, setPreviewText] = useState<string | null>(
    campaign.previewText
  );
  const [openSendDialog, setOpenSendDialog] = useState(false);

  const updateCampaignMutation = api.campaign.updateCampaign.useMutation({
    onSuccess: () => {
      utils.campaign.getCampaign.invalidate();
      setIsSaving(false);
    },
  });
  const sendCampaignMutation = api.campaign.sendCampaign.useMutation();
  const getUploadUrl = api.campaign.generateImagePresignedUrl.useMutation();

  const sendForm = useForm<z.infer<typeof sendSchema>>({
    resolver: zodResolver(sendSchema),
  });

  function updateEditorContent() {
    updateCampaignMutation.mutate({
      campaignId: campaign.id,
      content: JSON.stringify(json),
    });
  }

  const deboucedUpdateCampaign = useDebouncedCallback(
    updateEditorContent,
    1000
  );

  async function onSendCampaign(values: z.infer<typeof sendSchema>) {
    if (
      values.confirmation?.toLocaleLowerCase() !== "Send".toLocaleLowerCase()
    ) {
      sendForm.setError("confirmation", {
        message: "Please type 'Send' to confirm",
      });
      return;
    }

    sendCampaignMutation.mutate(
      {
        campaignId: campaign.id,
      },
      {
        onSuccess: () => {
          setOpenSendDialog(false);
          toast.success(`Campaign sent successfully`);
        },
        onError: (error) => {
          toast.error(`Failed to send campaign: ${error.message}`);
        },
      }
    );
  }

  const handleFileChange = async (file: File) => {
    if (file.size > IMAGE_SIZE_LIMIT) {
      throw new Error(
        `File should be less than ${IMAGE_SIZE_LIMIT / 1024 / 1024}MB`
      );
    }

    console.log("file type: ", file.type);

    const { uploadUrl, imageUrl } = await getUploadUrl.mutateAsync({
      name: file.name,
      type: file.type,
      campaignId: campaign.id,
    });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
    });

    if (!response.ok) {
      throw new Error("Failed to upload file");
    }

    return imageUrl;
  };

  const confirmation = sendForm.watch("confirmation");

  const contactBook = contactBooksQuery.data?.find(
    (book) => book.id === contactBookId
  );

  return (
    <div className="p-4 container mx-auto ">
      <div className="mx-auto">
        <div className="mb-4 flex justify-between items-center w-[700px] mx-auto">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className=" border-0 focus:ring-0 focus:outline-none px-0.5 w-[300px]"
            onBlur={() => {
              if (name === campaign.name || !name) {
                return;
              }
              updateCampaignMutation.mutate(
                {
                  campaignId: campaign.id,
                  name,
                },
                {
                  onError: (e) => {
                    toast.error(`${e.message}. Reverting changes.`);
                    setName(campaign.name);
                  },
                }
              );
            }}
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {isSaving ? (
                <div className="h-2 w-2 bg-yellow-500 rounded-full" />
              ) : (
                <div className="h-2 w-2 bg-emerald-500 rounded-full" />
              )}
              {formatDistanceToNow(campaign.updatedAt) === "less than a minute"
                ? "just now"
                : `${formatDistanceToNow(campaign.updatedAt)} ago`}
            </div>

            <ScheduleCampaign campaign={campaign} />
          </div>
        </div>

        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <div className="flex flex-col border shadow rounded-lg mt-12 mb-12 p-4 w-[700px] mx-auto z-50">
              <div className="flex items-center gap-4">
                <label className="block text-sm  w-[80px] text-muted-foreground">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                  }}
                  onBlur={() => {
                    if (subject === campaign.subject || !subject) {
                      return;
                    }
                    updateCampaignMutation.mutate(
                      {
                        campaignId: campaign.id,
                        subject,
                      },
                      {
                        onError: (e) => {
                          toast.error(`${e.message}. Reverting changes.`);
                          setSubject(campaign.subject);
                        },
                      }
                    );
                  }}
                  className="mt-1 py-1 text-sm block w-full outline-none border-b border-transparent  focus:border-border bg-transparent"
                />
                <AccordionTrigger className="py-0"></AccordionTrigger>
              </div>

              <AccordionContent className=" flex flex-col gap-4">
                <div className=" flex items-center gap-4 mt-4">
                  <label className=" text-sm  w-[80px] text-muted-foreground">
                    From
                  </label>
                  <input
                    type="text"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                    }}
                    className="mt-1 py-1 w-full text-sm outline-none border-b border-transparent  focus:border-border bg-transparent"
                    placeholder="Friendly name<hello@example.com>"
                    onBlur={() => {
                      if (from === campaign.from || !from) {
                        return;
                      }
                      updateCampaignMutation.mutate(
                        {
                          campaignId: campaign.id,
                          from,
                        },
                        {
                          onError: (e) => {
                            toast.error(`${e.message}. Reverting changes.`);
                            setFrom(campaign.from);
                          },
                        }
                      );
                    }}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="block text-sm  w-[80px] text-muted-foreground">
                    Reply To
                  </label>
                  <input
                    type="text"
                    value={replyTo}
                    onChange={(e) => {
                      setReplyTo(e.target.value);
                    }}
                    className="mt-1 py-1 text-sm block w-full outline-none border-b border-transparent bg-transparent focus:border-border"
                    placeholder="hello@example.com"
                    onBlur={() => {
                      if (replyTo === campaign.replyTo[0]) {
                        return;
                      }
                      updateCampaignMutation.mutate(
                        {
                          campaignId: campaign.id,
                          replyTo: replyTo ? [replyTo] : [],
                        },
                        {
                          onError: (e) => {
                            toast.error(`${e.message}. Reverting changes.`);
                            setReplyTo(campaign.replyTo[0]);
                          },
                        }
                      );
                    }}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="block text-sm  w-[80px] text-muted-foreground">
                    Preview
                  </label>
                  <input
                    type="text"
                    value={previewText ?? undefined}
                    onChange={(e) => {
                      setPreviewText(e.target.value);
                    }}
                    onBlur={() => {
                      if (
                        previewText === campaign.previewText ||
                        !previewText
                      ) {
                        return;
                      }
                      updateCampaignMutation.mutate(
                        {
                          campaignId: campaign.id,
                          previewText,
                        },
                        {
                          onError: (e) => {
                            toast.error(`${e.message}. Reverting changes.`);
                            setPreviewText(campaign.previewText ?? "");
                          },
                        }
                      );
                    }}
                    className="mt-1 py-1 text-sm block w-full outline-none border-b border-transparent bg-transparent  focus:border-border"
                  />
                </div>
                <div className=" flex items-center gap-2">
                  <label className="block text-sm  w-[80px] text-muted-foreground">
                    To
                  </label>
                  {contactBooksQuery.isLoading ? (
                    <Spinner className="w-6 h-6" />
                  ) : (
                    <Select
                      value={contactBookId ?? ""}
                      onValueChange={(val) => {
                        // Update the campaign's contactBookId
                        updateCampaignMutation.mutate(
                          {
                            campaignId: campaign.id,
                            contactBookId: val,
                          },
                          {
                            onError: () => {
                              setContactBookId(campaign.contactBookId);
                            },
                          }
                        );
                        setContactBookId(val);
                      }}
                    >
                      <SelectTrigger className="w-[300px]">
                        {contactBook
                          ? `${contactBook.emoji} ${contactBook.name}`
                          : "Select a contact book"}
                      </SelectTrigger>
                      <SelectContent>
                        {contactBooksQuery.data?.map((book) => (
                          <SelectItem key={book.id} value={book.id}>
                            {book.emoji} {book.name}{" "}
                            <span className="text-xs text-muted-foreground ml-4">
                              {" "}
                              {book._count.contacts} contacts
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </AccordionContent>
            </div>
          </AccordionItem>
        </Accordion>

        <div className=" rounded-lg bg-gray-50 w-[700px] mx-auto p-10">
          <div className="w-[600px] mx-auto">
            <Editor
              initialContent={json}
              onUpdate={(content) => {
                setJson(content.getJSON());
                setIsSaving(true);
                deboucedUpdateCampaign();
              }}
              variables={["email", "firstName", "lastName"]}
              uploadImage={
                campaign.imageUploadSupported ? handleFileChange : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
