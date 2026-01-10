"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Switch } from "@usesend/ui/src/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@usesend/ui/src/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { Spinner } from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { Badge } from "@usesend/ui/src/badge";
import { Clock, TrendingUp, Calendar, Users } from "lucide-react";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function SendTimeSettingsPage() {
  const settingsQuery = api.sendTime.getSettings.useQuery();
  const insightsQuery = api.sendTime.getTeamInsights.useQuery();
  const utils = api.useUtils();

  const [enableOptimization, setEnableOptimization] = useState(false);
  const [defaultHourStart, setDefaultHourStart] = useState(9);
  const [defaultHourEnd, setDefaultHourEnd] = useState(17);
  const [excludeDays, setExcludeDays] = useState<number[]>([]);
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");

  const updateMutation = api.sendTime.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.sendTime.getSettings.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setEnableOptimization(settingsQuery.data.enableOptimization);
      setDefaultHourStart(settingsQuery.data.defaultHourStart);
      setDefaultHourEnd(settingsQuery.data.defaultHourEnd);
      setExcludeDays(settingsQuery.data.excludeDays as number[]);
      setDefaultTimezone(settingsQuery.data.defaultTimezone);
    }
  }, [settingsQuery.data]);

  const handleSave = () => {
    updateMutation.mutate({
      enableOptimization,
      defaultHourStart,
      defaultHourEnd,
      excludeDays,
      defaultTimezone,
    });
  };

  const toggleExcludeDay = (day: number) => {
    if (excludeDays.includes(day)) {
      setExcludeDays(excludeDays.filter((d) => d !== day));
    } else {
      setExcludeDays([...excludeDays, day]);
    }
  };

  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const insights = insightsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Send Time Optimization</h2>
        <p className="text-sm text-muted-foreground">
          Automatically send emails at the optimal time for each contact based on their engagement patterns.
        </p>
      </div>

      {/* Insights Cards */}
      {insights?.hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{insights.totalContacts}</span>
              </div>
              <p className="text-sm text-muted-foreground">Contacts with data</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{insights.totalOpens.toLocaleString()}</span>
              </div>
              <p className="text-sm text-muted-foreground">Total opens tracked</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">
                  {insights.bestHours[0] !== undefined ? formatHour(insights.bestHours[0]) : "N/A"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Best time to send</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">
                  {insights.bestDays[0]?.name || "N/A"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Best day to send</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hourly Distribution Chart */}
      {insights?.hasData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-mono">Engagement by Hour</CardTitle>
            <CardDescription>
              When your contacts typically engage with emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {Object.entries(insights.hourlyDistribution).map(([hour, score]) => {
                const maxScore = Math.max(...Object.values(insights.hourlyDistribution));
                const height = maxScore > 0 ? (score / maxScore) * 100 : 0;
                const isTopHour = insights.bestHours.includes(parseInt(hour));

                return (
                  <div
                    key={hour}
                    className="flex-1 flex flex-col items-center"
                    title={`${formatHour(parseInt(hour))}: ${score} engagements`}
                  >
                    <div
                      className={`w-full rounded-t ${
                        isTopHour ? "bg-primary" : "bg-muted"
                      }`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    {parseInt(hour) % 3 === 0 && (
                      <span className="text-[10px] text-muted-foreground mt-1">
                        {parseInt(hour)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-mono">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Enable Send Time Optimization</label>
              <p className="text-xs text-muted-foreground">
                Automatically optimize send times based on contact engagement
              </p>
            </div>
            <Switch
              checked={enableOptimization}
              onCheckedChange={setEnableOptimization}
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Default Timezone</label>
              <p className="text-xs text-muted-foreground mb-2">
                Used when no contact timezone data is available
              </p>
              <Select value={defaultTimezone} onValueChange={setDefaultTimezone}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Default Start Hour</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Earliest time to send emails
                </p>
                <Select
                  value={String(defaultHourStart)}
                  onValueChange={(v) => setDefaultHourStart(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {formatHour(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Default End Hour</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Latest time to send emails
                </p>
                <Select
                  value={String(defaultHourEnd)}
                  onValueChange={(v) => setDefaultHourEnd(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {formatHour(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Exclude Days</label>
              <p className="text-xs text-muted-foreground mb-2">
                Don't send emails on these days
              </p>
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((day, index) => (
                  <Badge
                    key={day}
                    variant={excludeDays.includes(index) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleExcludeDay(index)}
                  >
                    {day}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              isLoading={updateMutation.isPending}
            >
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
