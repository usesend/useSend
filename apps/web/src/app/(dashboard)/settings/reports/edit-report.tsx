"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { Pencil, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { Input } from "@usesend/ui/src/input";
import { useForm } from "react-hook-form";
import { api } from "~/trpc/react";
import { toast } from "@usesend/ui/src/toaster";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Badge } from "@usesend/ui/src/badge";
import { ReportFrequency } from "@prisma/client";

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`,
}));

const editReportSchema = z.object({
  name: z.string().min(1, "Name is required"),
  recipients: z.array(z.string().email("Invalid email address")).min(1, "At least one recipient is required"),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  dayOfWeek: z.string().optional(),
  dayOfMonth: z.string().optional(),
  hour: z.string(),
  timezone: z.string(),
});

type FormData = z.infer<typeof editReportSchema>;

interface EditReportProps {
  report: {
    id: string;
    name: string;
    recipients: string[];
    frequency: ReportFrequency;
    dayOfWeek: number | null;
    dayOfMonth: number | null;
    hour: number;
    timezone: string;
  };
}

export default function EditReport({ report }: EditReportProps) {
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(editReportSchema),
    defaultValues: {
      name: report.name,
      recipients: report.recipients,
      frequency: report.frequency,
      dayOfWeek: report.dayOfWeek?.toString() ?? "1",
      dayOfMonth: report.dayOfMonth?.toString() ?? "1",
      hour: report.hour.toString(),
      timezone: report.timezone,
    },
  });

  const utils = api.useUtils();
  const updateMutation = api.scheduledReport.update.useMutation();

  const frequency = form.watch("frequency");
  const recipients = form.watch("recipients");

  function addRecipient() {
    const email = emailInput.trim();
    if (email && z.string().email().safeParse(email).success) {
      const current = form.getValues("recipients");
      if (!current.includes(email)) {
        form.setValue("recipients", [...current, email]);
      }
      setEmailInput("");
    }
  }

  function removeRecipient(email: string) {
    const current = form.getValues("recipients");
    form.setValue(
      "recipients",
      current.filter((e) => e !== email)
    );
  }

  function onSubmit(values: FormData) {
    updateMutation.mutate(
      {
        id: report.id,
        name: values.name,
        recipients: values.recipients,
        frequency: values.frequency,
        dayOfWeek: values.frequency === "WEEKLY" ? parseInt(values.dayOfWeek ?? "1") : null,
        dayOfMonth: values.frequency === "MONTHLY" ? parseInt(values.dayOfMonth ?? "1") : null,
        hour: parseInt(values.hour),
        timezone: values.timezone,
      },
      {
        onSuccess: () => {
          setOpen(false);
          utils.scheduledReport.list.invalidate();
          toast.success("Report updated");
        },
        onError: (error) => {
          toast.error(error.message || "Failed to update report");
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Scheduled Report</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Report Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Weekly Performance Report" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recipients"
              render={() => (
                <FormItem>
                  <FormLabel>Recipients</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      placeholder="email@example.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addRecipient();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addRecipient}>
                      Add
                    </Button>
                  </div>
                  {recipients.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {recipients.map((email) => (
                        <Badge key={email} variant="secondary" className="pr-1">
                          {email}
                          <button
                            type="button"
                            onClick={() => removeRecipient(email)}
                            className="ml-1 hover:bg-muted rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <FormDescription>
                    Add email addresses to receive this report
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DAILY">Daily</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {frequency === "WEEKLY" && (
              <FormField
                control={form.control}
                name="dayOfWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Day of Week</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {frequency === "MONTHLY" && (
              <FormField
                control={form.control}
                name="dayOfMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Day of Month</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {i + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Reports are sent on the 28th for months with fewer days
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="hour"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour.value} value={hour.value}>
                          {hour.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                isLoading={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
