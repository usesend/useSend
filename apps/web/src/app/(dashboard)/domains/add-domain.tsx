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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";

import { api } from "~/trpc/react";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as tldts from "tldts";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { toast } from "@usesend/ui/src/toaster";
import { useUpgradeModalStore } from "~/store/upgradeModalStore";
import { LimitReason } from "~/lib/constants/plans";

const domainSchema = z.object({
  region: z.string().optional(),
  domain: z.string({ required_error: "Domain is required" }).min(1, {
    message: "Domain is required",
  }),
});

export default function AddDomain() {
  const [open, setOpen] = useState(false);

  const regionQuery = api.domain.getAvailableRegions.useQuery();
  const limitsQuery = api.limits.get.useQuery({ type: LimitReason.DOMAIN });

  const { openModal } = useUpgradeModalStore((s) => s.action);

  const addDomainMutation = api.domain.createDomain.useMutation();

  const domainForm = useForm<z.infer<typeof domainSchema>>({
    resolver: zodResolver(domainSchema),
    defaultValues: {
      region: "",
      domain: "",
    },
  });

  const utils = api.useUtils();
  const router = useRouter();

  const singleRegion =
    regionQuery.data?.length === 1 ? regionQuery.data[0] : undefined;

  const showRegionSelect = (regionQuery.data?.length ?? 0) > 1;

  async function onDomainAdd(values: z.infer<typeof domainSchema>) {
    const domain = tldts.getDomain(values.domain);
    if (!domain) {
      domainForm.setError("domain", {
        message: "Invalid domain",
      });

      return;
    }

    if (!values.region && !singleRegion) {
      domainForm.setError("region", {
        message: "Region is required",
      });
      return;
    }

    if (limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    addDomainMutation.mutate(
      {
        name: values.domain,
        region: singleRegion ?? values.region ?? "",
      },
      {
        onSuccess: async (data) => {
          utils.domain.domains.invalidate();
          await router.push(`/domains/${data.id}`);
          setOpen(false);
        },
        onError: async (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  function onOpenChange(_open: boolean) {
    if (_open && limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    setOpen(_open);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(_open) => (_open !== open ? onOpenChange(_open) : null)}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Add domain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new domain</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...domainForm}>
            <form
              onSubmit={domainForm.handleSubmit(onDomainAdd)}
              className="space-y-8"
            >
              <FormField
                control={domainForm.control}
                name="domain"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Domain</FormLabel>
                    <FormControl>
                      <Input placeholder="subdomain.example.com" {...field} />
                    </FormControl>
                    {formState.errors.domain ? (
                      <FormMessage />
                    ) : (
                      <FormDescription>
                        Use subdomains to separate transactional and marketing
                        emails.{" "}
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />

              {showRegionSelect && (
                <FormField
                  control={domainForm.control}
                  name="region"
                  render={({ field, formState }) => (
                    <FormItem>
                      <FormLabel>Region</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={regionQuery.isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {regionQuery.data?.map((region) => (
                            <SelectItem value={region} key={region}>
                              {region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formState.errors.region ? (
                        <FormMessage />
                      ) : (
                        <FormDescription>
                          Select the region from where the email is sent{" "}
                        </FormDescription>
                      )}
                    </FormItem>
                  )}
                />
              )}

              <div className="flex justify-end">
                <Button
                  className=" w-[100px]"
                  type="submit"
                  disabled={
                    addDomainMutation.isPending || limitsQuery.isLoading
                  }
                >
                  {addDomainMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
