"use client";

import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { useForm } from "react-hook-form";
import { toast } from "@usesend/ui/src/toaster";
import { ChevronDown, Plus } from "lucide-react";
import {
  ContactEvents,
  DomainEvents,
  EmailEvents,
  WebhookEvents,
  type WebhookEventType,
} from "@usesend/lib/src/webhook/webhook-events";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@usesend/ui/src/dropdown-menu";
import { LimitReason } from "~/lib/constants/plans";
import { useUpgradeModalStore } from "~/store/upgradeModalStore";

const EVENT_TYPES_ENUM = z.enum(WebhookEvents);

const webhookSchema = z.object({
  url: z
    .string({ required_error: "URL is required" })
    .url("Please enter a valid URL"),
  eventTypes: z.array(EVENT_TYPES_ENUM, {
    required_error: "Select at least one event",
  }),
  domainIds: z.array(z.number().int().positive()),
});

type WebhookFormValues = z.infer<typeof webhookSchema>;

const eventGroups: {
  label: string;
  events: readonly WebhookEventType[];
}[] = [
  { label: "Contact events", events: ContactEvents },
  { label: "Domain events", events: DomainEvents },
  { label: "Email events", events: EmailEvents },
];

export function AddWebhook() {
  const [open, setOpen] = useState(false);
  const [allEventsSelected, setAllEventsSelected] = useState(false);
  const createWebhookMutation = api.webhook.create.useMutation();
  const domainsQuery = api.domain.domains.useQuery();
  const limitsQuery = api.limits.get.useQuery({ type: LimitReason.WEBHOOK });
  const { openModal } = useUpgradeModalStore((s) => s.action);

  const utils = api.useUtils();

  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      url: "",
      eventTypes: [],
      domainIds: [],
    },
  });

  function onOpenChange(nextOpen: boolean) {
    if (nextOpen && limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    setOpen(nextOpen);
  }

  function handleSubmit(values: WebhookFormValues) {
    if (limitsQuery.data?.isLimitReached) {
      openModal(limitsQuery.data.reason);
      return;
    }

    const selectedEvents = values.eventTypes ?? [];

    if (!allEventsSelected && selectedEvents.length === 0) {
      toast.error("Select at least one event or all events");
      return;
    }

    createWebhookMutation.mutate(
      {
        url: values.url,
        eventTypes: allEventsSelected ? [] : selectedEvents,
        domainIds: values.domainIds,
      },
      {
        onSuccess: async () => {
          await utils.webhook.list.invalidate();
          form.reset({
            url: "",
            eventTypes: [],
            domainIds: [],
          });
          setAllEventsSelected(false);
          setOpen(false);
          toast.success("Webhook created successfully");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) =>
        nextOpen !== open ? onOpenChange(nextOpen) : null
      }
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Add webhook
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a new webhook</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6"
            >
              <FormField
                control={form.control}
                name="url"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>Endpoint URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/webhooks/usesend"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="eventTypes"
                render={({ field, formState }) => {
                  const selectedEvents = field.value ?? [];
                  const totalEvents = WebhookEvents;

                  const selectedCount = allEventsSelected
                    ? totalEvents.length
                    : selectedEvents.length;

                  const allSelectedLabel =
                    selectedCount === 0
                      ? "Select events"
                      : allEventsSelected
                        ? "All events"
                        : selectedCount === 1
                          ? selectedEvents[0]
                          : `${selectedCount} events selected`;

                  const isGroupFullySelected = (
                    groupEvents: readonly WebhookEventType[],
                  ) => {
                    if (allEventsSelected) return true;
                    if (selectedEvents.length === 0) return false;
                    return groupEvents.every((event) =>
                      selectedEvents.includes(event),
                    );
                  };

                  const handleToggleAll = (checked: boolean) => {
                    if (checked) {
                      setAllEventsSelected(true);
                      field.onChange([]);
                    } else {
                      setAllEventsSelected(false);
                      field.onChange([]);
                    }
                  };

                  const handleToggleGroup = (
                    groupEvents: readonly WebhookEventType[],
                  ) => {
                    if (allEventsSelected) {
                      const next = totalEvents.filter(
                        (event) => !groupEvents.includes(event),
                      );
                      setAllEventsSelected(false);
                      field.onChange(next);
                      return;
                    }

                    const current = new Set(selectedEvents);
                    const fullySelected = groupEvents.every((event) =>
                      current.has(event),
                    );

                    if (fullySelected) {
                      groupEvents.forEach((event) => current.delete(event));
                    } else {
                      groupEvents.forEach((event) => current.add(event));
                    }

                    field.onChange(Array.from(current));
                  };

                  const handleToggleEvent = (event: WebhookEventType) => {
                    if (allEventsSelected) {
                      const next = WebhookEvents.filter((e) => e !== event);
                      setAllEventsSelected(false);
                      field.onChange(next);
                      return;
                    }

                    const exists = selectedEvents.includes(event);
                    const next = exists
                      ? selectedEvents.filter((e) => e !== event)
                      : [...selectedEvents, event];
                    field.onChange(next);
                  };

                  return (
                    <FormItem>
                      <FormLabel>Events</FormLabel>
                      <FormControl>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-3 inline-flex w-full items-center justify-between"
                            >
                              <span className="truncate text-left text-sm">
                                {allSelectedLabel}
                              </span>
                              <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] h-[30vh] ">
                            <div className="space-y-3">
                              <DropdownMenuCheckboxItem
                                checked={allEventsSelected}
                                onCheckedChange={(checked) =>
                                  handleToggleAll(Boolean(checked))
                                }
                                onSelect={(event) => event.preventDefault()}
                                className="font-medium mb-2 px-2"
                              >
                                All events
                              </DropdownMenuCheckboxItem>
                              {eventGroups.map((group) => (
                                <div key={group.label} className="">
                                  <DropdownMenuCheckboxItem
                                    checked={isGroupFullySelected(group.events)}
                                    onCheckedChange={() =>
                                      handleToggleGroup(group.events)
                                    }
                                    onSelect={(event) => event.preventDefault()}
                                    className="px-2 text-xs font-semibold text-muted-foreground"
                                  >
                                    {group.label}
                                  </DropdownMenuCheckboxItem>
                                  {group.events.map((event) => (
                                    <DropdownMenuCheckboxItem
                                      key={event}
                                      checked={
                                        allEventsSelected ||
                                        selectedEvents.includes(event)
                                      }
                                      onCheckedChange={() =>
                                        handleToggleEvent(event)
                                      }
                                      onSelect={(event) =>
                                        event.preventDefault()
                                      }
                                      className="pl-3 pr-2 font-mono"
                                    >
                                      {event}
                                    </DropdownMenuCheckboxItem>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </FormControl>
                      {formState.errors.eventTypes ? <FormMessage /> : null}
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="domainIds"
                render={({ field }) => {
                  const selectedDomainIds = field.value ?? [];
                  const selectedDomains =
                    domainsQuery.data?.filter((domain) =>
                      selectedDomainIds.includes(domain.id),
                    ) ?? [];

                  const selectedDomainsLabel =
                    selectedDomainIds.length === 0
                      ? "All domains"
                      : selectedDomainIds.length === 1
                        ? (selectedDomains[0]?.name ?? "1 domain selected")
                        : `${selectedDomainIds.length} domains selected`;

                  const handleToggleDomain = (domainId: number) => {
                    const exists = selectedDomainIds.includes(domainId);
                    const next = exists
                      ? selectedDomainIds.filter((id) => id !== domainId)
                      : [...selectedDomainIds, domainId];
                    field.onChange(next);
                  };

                  return (
                    <FormItem>
                      <FormLabel>Domains</FormLabel>
                      <FormControl>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-3 inline-flex w-full items-center justify-between"
                            >
                              <span className="truncate text-left text-sm">
                                {selectedDomainsLabel}
                              </span>
                              <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="h-[30vh] w-[--radix-dropdown-menu-trigger-width]">
                            <div className="space-y-3">
                              <DropdownMenuCheckboxItem
                                checked={selectedDomainIds.length === 0}
                                onCheckedChange={() => field.onChange([])}
                                onSelect={(event) => event.preventDefault()}
                                className="mb-2 px-2 font-medium"
                              >
                                All domains
                              </DropdownMenuCheckboxItem>
                              {domainsQuery.data?.map((domain) => (
                                <DropdownMenuCheckboxItem
                                  key={domain.id}
                                  checked={selectedDomainIds.includes(
                                    domain.id,
                                  )}
                                  onCheckedChange={() =>
                                    handleToggleDomain(domain.id)
                                  }
                                  onSelect={(event) => event.preventDefault()}
                                  className="pl-3 pr-2"
                                >
                                  {domain.name}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </FormControl>
                      <FormDescription>
                        Leave this as all domains to receive events from every
                        domain.
                      </FormDescription>
                    </FormItem>
                  );
                }}
              />
              <div className="flex justify-end">
                <Button
                  className="w-[120px]"
                  type="submit"
                  disabled={createWebhookMutation.isPending}
                >
                  {createWebhookMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
