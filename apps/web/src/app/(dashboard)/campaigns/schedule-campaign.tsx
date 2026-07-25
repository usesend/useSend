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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@usesend/ui/src/popover";
import * as chrono from "chrono-node";
import { api } from "~/trpc/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@usesend/ui/src/toaster";
import { Calendar as CalendarIcon, Clock3, Send } from "lucide-react";
import { Calendar } from "@usesend/ui/src/calendar";
import type { Campaign } from "@prisma/client";
import { format } from "date-fns";
import { Spinner } from "@usesend/ui/src/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import {
  calculateGradualDelivery,
  GRADUAL_DELIVERY_INTERVAL_MINUTES,
} from "~/lib/campaign-delivery";
import type { GradualDeliveryInterval } from "~/lib/campaign-delivery";

type DeliveryMode = "ALL_AT_ONCE" | "GRADUAL";

export const ScheduleCampaign: React.FC<{
  campaign: Partial<Campaign> & { id: string };
  onScheduled?: () => void;
}> = ({ campaign, onScheduled }) => {
  const initialScheduledAtDate = campaign.scheduledAt
    ? new Date(campaign.scheduledAt)
    : null;
  const [open, setOpen] = useState(false);
  const [scheduleInput, setScheduleInput] = useState<string>(
    initialScheduledAtDate
      ? format(initialScheduledAtDate, "yyyy-MM-dd HH:mm")
      : "",
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    initialScheduledAtDate ?? new Date(),
  );
  const [isConfirmNow, setIsConfirmNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    campaign.deliveryMode ?? "ALL_AT_ONCE",
  );
  const [batchPercentage, setBatchPercentage] = useState(
    String(campaign.deliveryBatchPercentage ?? 10),
  );
  const [deliveryInterval, setDeliveryInterval] =
    useState<GradualDeliveryInterval>(
      campaign.deliveryIntervalMinutes === 1 ? "minute" : "hour",
    );
  const scheduleMutation = api.campaign.scheduleCampaign.useMutation();
  const audienceQuery = api.campaign.getAudienceCount.useQuery(
    { campaignId: campaign.id },
    { enabled: open && deliveryMode === "GRADUAL" },
  );
  const utils = api.useUtils();
  const scheduledAtTimestamp = campaign.scheduledAt
    ? new Date(campaign.scheduledAt).getTime()
    : null;

  useEffect(() => {
    if (!open) return;

    setDeliveryMode(campaign.deliveryMode ?? "ALL_AT_ONCE");
    setBatchPercentage(String(campaign.deliveryBatchPercentage ?? 10));
    setDeliveryInterval(
      campaign.deliveryIntervalMinutes === 1 ? "minute" : "hour",
    );

    if (scheduledAtTimestamp != null) {
      const scheduledDate = new Date(scheduledAtTimestamp);
      setSelectedDate(scheduledDate);
      setScheduleInput(format(scheduledDate, "yyyy-MM-dd HH:mm"));
      return;
    }

    const now = new Date();
    setSelectedDate(now);
    setScheduleInput("");
  }, [
    campaign.deliveryBatchPercentage,
    campaign.deliveryIntervalMinutes,
    campaign.deliveryMode,
    open,
    scheduledAtTimestamp,
  ]);

  const parsedBatchPercentage = Number(batchPercentage);
  const isBatchPercentageValid =
    batchPercentage.trim().length > 0 &&
    Number.isInteger(parsedBatchPercentage) &&
    parsedBatchPercentage >= 1 &&
    parsedBatchPercentage <= 50;

  const deliveryEstimate = useMemo(() => {
    if (
      deliveryMode !== "GRADUAL" ||
      !isBatchPercentageValid ||
      audienceQuery.data == null
    ) {
      return null;
    }

    return calculateGradualDelivery({
      audienceSize: audienceQuery.data.total,
      batchPercentage: parsedBatchPercentage,
      intervalMinutes: GRADUAL_DELIVERY_INTERVAL_MINUTES[deliveryInterval],
      startsAt: selectedDate ?? new Date(),
    });
  }, [
    audienceQuery.data,
    batchPercentage,
    deliveryInterval,
    deliveryMode,
    isBatchPercentageValid,
    selectedDate,
  ]);

  const onSchedule = (scheduledAt?: Date) => {
    if (error) setError(null);

    if (deliveryMode === "GRADUAL" && !isBatchPercentageValid) {
      setError("Batch percentage must be a whole number between 1 and 50");
      return;
    }

    scheduleMutation.mutate(
      {
        campaignId: campaign.id,
        // Never send free text to backend; only a Date
        scheduledAt: scheduledAt ? scheduledAt : undefined,
        delivery:
          deliveryMode === "GRADUAL"
            ? {
                strategy: "GRADUAL",
                batchPercentage: parsedBatchPercentage,
                interval: deliveryInterval,
              }
            : { strategy: "ALL_AT_ONCE" },
      },
      {
        onSuccess: () => {
          utils.campaign.getCampaigns.invalidate();
          utils.campaign.getCampaign.invalidate({ campaignId: campaign.id });
          setOpen(false);
          setScheduleInput("");
          setSelectedDate(null);
          setIsConfirmNow(false);
          setError(null);
          toast.success("Campaign scheduled");
          onScheduled?.();
        },
        onError: (error) => {
          setError(error.message || "Failed to schedule campaign");
        },
      },
    );
  };

  const onDialogSchedule = () => {
    const parsed = selectedDate ?? chrono.parseDate(scheduleInput);
    if (!parsed) {
      setError("Invalid date and time");
      return;
    }

    onSchedule(parsed);
  };

  const onScheduleInputChange = (input: string) => {
    setScheduleInput(input);
    if (error) setError(null);
    const parsed = chrono.parseDate(input);
    if (parsed) {
      setSelectedDate(parsed);
    } else {
      setSelectedDate(new Date());
    }
  };

  // Generate 15-minute time slots from 12:00 AM to 11:45 PM
  const timeOptions = useMemo(() => {
    const options: { minutes: number; label: string }[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let m = 0; m < 24 * 60; m += 15) {
      const d = new Date(base);
      d.setMinutes(m);
      options.push({ minutes: m, label: format(d, "h:mm a") });
    }
    return options;
  }, []);

  const getMinutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

  const formatForInput = (d: Date) => format(d, "yyyy-MM-dd HH:mm");

  const setDatePreserveTime = (dateOnly: Date) => {
    const current = selectedDate ?? new Date();
    const updated = new Date(dateOnly);
    updated.setHours(current.getHours(), current.getMinutes(), 0, 0);
    setSelectedDate(updated);
    setScheduleInput(formatForInput(updated));
  };

  const setTimePreserveDate = (minutesFromMidnight: number) => {
    const base = selectedDate ?? new Date();
    const hours = Math.floor(minutesFromMidnight / 60);
    const minutes = minutesFromMidnight % 60;
    const updated = new Date(base);
    updated.setHours(hours, minutes, 0, 0);
    setSelectedDate(updated);
    setScheduleInput(formatForInput(updated));
  };

  const dialogContentRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Dialog
        open={open}
        onOpenChange={(_open) => {
          if (_open !== open) {
            setOpen(_open);
            if (!_open) {
              setError(null);
              setDeliveryMode(campaign.deliveryMode ?? "ALL_AT_ONCE");
              setBatchPercentage(
                String(campaign.deliveryBatchPercentage ?? 10),
              );
              setDeliveryInterval(
                campaign.deliveryIntervalMinutes === 1 ? "minute" : "hour",
              );
            }
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="default">Schedule Campaign</Button>
        </DialogTrigger>
        <DialogContent
          ref={dialogContentRef}
          className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]"
        >
          <DialogHeader>
            <DialogTitle>Schedule Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-7 py-2">
            <div>
              <label htmlFor="scheduledAt" className="block mb-2">
                Schedule at
              </label>
              <div className="relative">
                <Input
                  id="scheduledAt"
                  placeholder="e.g., tomorrow 9am, next monday 10:30"
                  value={scheduleInput}
                  onChange={(e) => onScheduleInputChange(e.target.value)}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Open date picker"
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[420px]"
                    align="end"
                    container={dialogContentRef.current}
                  >
                    <label className="block text-sm mb-2">
                      Pick date & time
                    </label>
                    <div className="flex gap-4 items-start">
                      <Calendar
                        mode="single"
                        selected={selectedDate ?? new Date()}
                        onSelect={(d) => {
                          if (d) setDatePreserveTime(d);
                        }}
                        className="rounded-md border w-[250px] h-[300px]  shrink-0 font-mono"
                      />
                      <div
                        className="h-[300px] overflow-y-auto no-scrollbar overscroll-contain rounded-md border p-1 w-[140px] min-h-0 font-mono"
                        onWheelCapture={(e) => {
                          e.stopPropagation();
                        }}
                        onTouchMoveCapture={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {timeOptions.map((opt) => {
                          const isActive = selectedDate
                            ? getMinutesOfDay(selectedDate) === opt.minutes
                            : false;
                          return (
                            <button
                              key={opt.minutes}
                              type="button"
                              onClick={() => setTimePreserveDate(opt.minutes)}
                              className={
                                "w-full text-left text-sm px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground " +
                                (isActive
                                  ? " bg-accent text-accent-foreground"
                                  : "")
                              }
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="font-mono mt-4 rounded p-2 text-primary border border-border text-sm">
                {selectedDate ? (
                  <span className="">
                    {format(selectedDate, "MMMM do, h:mm a")}
                  </span>
                ) : (
                  <span className="">No date selected</span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium">Delivery</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Choose how quickly recipients enter the sending queue.
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={deliveryMode === "ALL_AT_ONCE"}
                  onClick={() => setDeliveryMode("ALL_AT_ONCE")}
                  className={`rounded-md border p-3 text-left transition-colors hover:border-foreground/40 ${
                    deliveryMode === "ALL_AT_ONCE"
                      ? "border-foreground bg-muted/60"
                      : "border-border"
                  }`}
                >
                  <Send className="mb-3 h-4 w-4" />
                  <div className="text-sm font-medium">All at once</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    Queue the full audience when sending starts.
                  </div>
                </button>

                <button
                  type="button"
                  aria-pressed={deliveryMode === "GRADUAL"}
                  onClick={() => setDeliveryMode("GRADUAL")}
                  className={`rounded-md border p-3 text-left transition-colors hover:border-foreground/40 ${
                    deliveryMode === "GRADUAL"
                      ? "border-foreground bg-muted/60"
                      : "border-border"
                  }`}
                >
                  <Clock3 className="mb-3 h-4 w-4" />
                  <div className="text-sm font-medium">Gradual</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    Release a percentage of recipients in timed waves.
                  </div>
                </button>
              </div>

              {deliveryMode === "GRADUAL" ? (
                <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="deliveryBatchPercentage"
                        className="text-sm font-medium"
                      >
                        Audience per wave
                      </label>
                      <div className="relative">
                        <Input
                          id="deliveryBatchPercentage"
                          type="number"
                          min={1}
                          max={50}
                          step={1}
                          value={batchPercentage}
                          onChange={(event) =>
                            setBatchPercentage(event.target.value)
                          }
                          aria-invalid={!isBatchPercentageValid}
                          className="pr-8 font-mono"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                      {!isBatchPercentageValid ? (
                        <p className="text-xs text-destructive">
                          Enter a whole number from 1 to 50.
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="deliveryInterval"
                        className="text-sm font-medium"
                      >
                        Time between waves
                      </label>
                      <Select
                        value={deliveryInterval}
                        onValueChange={(value) =>
                          setDeliveryInterval(value as GradualDeliveryInterval)
                        }
                      >
                        <SelectTrigger id="deliveryInterval">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minute">Every minute</SelectItem>
                          <SelectItem value="hour">Every hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    {audienceQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner className="h-4 w-4" />
                        Calculating delivery plan
                      </div>
                    ) : audienceQuery.isError ? (
                      <div
                        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                        role="alert"
                      >
                        <p className="text-sm text-destructive">
                          Couldn&apos;t load the audience preview.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void audienceQuery.refetch()}
                          disabled={audienceQuery.isFetching}
                        >
                          {audienceQuery.isFetching ? "Retrying" : "Retry"}
                        </Button>
                      </div>
                    ) : deliveryEstimate && deliveryEstimate.batchSize > 0 ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-3 font-mono">
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Per wave
                            </div>
                            <div className="mt-1 text-sm">
                              {deliveryEstimate.batchSize.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Waves
                            </div>
                            <div className="mt-1 text-sm">
                              {deliveryEstimate.totalBatches.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              Estimated end
                            </div>
                            <div className="mt-1 text-sm">
                              {format(deliveryEstimate.completesAt, "MMM d, p")}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Based on the current subscribed audience. The final
                          audience is captured when sending starts.
                        </p>
                      </div>
                    ) : isBatchPercentageValid ? (
                      <p className="text-sm text-muted-foreground">
                        No subscribed recipients to preview yet.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-4 items-center ">
              {isConfirmNow ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Are you sure you want to start this campaign now?
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      onSchedule(new Date());
                    }}
                    disabled={
                      scheduleMutation.isPending ||
                      (deliveryMode === "GRADUAL" && !isBatchPercentageValid)
                    }
                  >
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsConfirmNow(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsConfirmNow(true);
                    }}
                    disabled={scheduleMutation.isPending}
                  >
                    Send Now
                  </Button>
                  <Button
                    className="w-[130px]"
                    onClick={() => {
                      onDialogSchedule();
                    }}
                    isLoading={scheduleMutation.isPending}
                    showSpinner={true}
                    disabled={
                      deliveryMode === "GRADUAL" && !isBatchPercentageValid
                    }
                  >
                    {scheduleMutation.isPending ? "Scheduling" : "Schedule"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScheduleCampaign;
