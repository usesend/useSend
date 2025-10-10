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
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@usesend/ui/src/calendar";
import { Campaign } from "@prisma/client";
import { format } from "date-fns";
import { Spinner } from "@usesend/ui/src/spinner";

export const ScheduleCampaign: React.FC<{
  campaign: Partial<Campaign> & { id: string };
}> = ({ campaign }) => {
  const initialScheduledAtDate = campaign.scheduledAt
    ? new Date(campaign.scheduledAt)
    : null;
  const [open, setOpen] = useState(false);
  const [scheduleInput, setScheduleInput] = useState<string>(
    initialScheduledAtDate ? format(initialScheduledAtDate, "yyyy-MM-dd HH:mm") : ""
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    initialScheduledAtDate ?? new Date()
  );
  const [isConfirmNow, setIsConfirmNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduleMutation = api.campaign.scheduleCampaign.useMutation();
  const utils = api.useUtils();
  const scheduledAtTimestamp = campaign.scheduledAt
    ? new Date(campaign.scheduledAt).getTime()
    : null;

  useEffect(() => {
    if (!open) return;

    if (scheduledAtTimestamp != null) {
      const scheduledDate = new Date(scheduledAtTimestamp);
      setSelectedDate(scheduledDate);
      setScheduleInput(format(scheduledDate, "yyyy-MM-dd HH:mm"));
      return;
    }

    const now = new Date();
    setSelectedDate(now);
    setScheduleInput("");
  }, [open, scheduledAtTimestamp]);

  const onSchedule = (scheduledAt?: Date) => {
    if (error) setError(null);
    scheduleMutation.mutate(
      {
        campaignId: campaign.id,
        // Never send free text to backend; only a Date
        scheduledAt: scheduledAt ? scheduledAt : undefined,
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
        },
        onError: (error) => {
          setError(error.message || "Failed to schedule campaign");
        },
      }
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
            if (!_open) setError(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="default">Schedule Campaign</Button>
        </DialogTrigger>
        <DialogContent ref={dialogContentRef}>
          <DialogHeader>
            <DialogTitle>Schedule Campaign</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-8">
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
                        className="rounded-md border w-[250px] h-[300px]  shrink-0"
                      />
                      <div
                        className="h-[300px] overflow-y-auto no-scrollbar overscroll-contain rounded-md border p-1 w-[140px] min-h-0"
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

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-4 items-center ">
              {isConfirmNow ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Are you sure you want to send this campaign now?
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      onSchedule(new Date());
                    }}
                    disabled={scheduleMutation.isPending}
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
