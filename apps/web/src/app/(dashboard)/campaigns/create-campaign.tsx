"use client";

import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";

import { api } from "~/trpc/react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@usesend/ui/src/toaster";
import { useRouter } from "next/navigation";
import Spinner from "@usesend/ui/src/spinner";

const campaignSchema = z.object({
  name: z.string({ required_error: "Name is required" }).min(1, {
    message: "Name is required",
  }),
  from: z.string({ required_error: "From email is required" }).min(1, {
    message: "From email is required",
  }),
  subject: z.string({ required_error: "Subject is required" }).min(1, {
    message: "Subject is required",
  }),
});

export default function CreateCampaign() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const createCampaignMutation = api.campaign.createCampaign.useMutation();

  const campaignForm = useForm<z.infer<typeof campaignSchema>>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      from: "",
      subject: "",
    },
  });

  const utils = api.useUtils();

  async function onCampaignCreate(values: z.infer<typeof campaignSchema>) {
    createCampaignMutation.mutate(
      {
        name: values.name,
        from: values.from,
        subject: values.subject,
      },
      {
        onSuccess: async (data) => {
          utils.campaign.getCampaigns.invalidate();
          router.push(`/campaigns/${data.id}/edit`);
          toast.success("Campaign created successfully");
          setOpen(false);
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? setOpen(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Create Campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new campaign</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...campaignForm}>
            <form
              onSubmit={campaignForm.handleSubmit(onCampaignCreate)}
              className="space-y-8"
            >
              <FormField
                control={campaignForm.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Campaign Name" {...field} />
                    </FormControl>
                    {formState.errors.name ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <FormField
                control={campaignForm.control}
                name="from"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>From</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Friendly Name <from@example.com>"
                        {...field}
                      />
                    </FormControl>
                    {formState.errors.from ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <FormField
                control={campaignForm.control}
                name="subject"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="Campaign Subject" {...field} />
                    </FormControl>
                    {formState.errors.subject ? <FormMessage /> : null}
                  </FormItem>
                )}
              />
              <p className="text-muted-foreground text-sm">
                Don't worry, you can change it later.
              </p>
              <div className="flex justify-end">
                <Button
                  className=" w-[100px]"
                  type="submit"
                  disabled={createCampaignMutation.isPending}
                >
                  {createCampaignMutation.isPending ? (
                    <Spinner className="w-4 h-4" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
