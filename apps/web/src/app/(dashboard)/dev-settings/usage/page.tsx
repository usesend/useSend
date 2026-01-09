"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Spinner } from "@usesend/ui/src/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import { Badge } from "@usesend/ui/src/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usesend/ui/src/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { BarChart3, Mail, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function ApiUsagePage() {
  const [days, setDays] = useState(30);
  const usageQuery = api.apiKey.getApiUsage.useQuery({ days });

  if (usageQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const data = usageQuery.data;

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Failed to load usage data</p>
      </div>
    );
  }

  // Calculate totals from byKey data
  const totals = data.byKey.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      delivered: acc.delivered + row.delivered,
      bounced: acc.bounced + row.bounced,
      failed: acc.failed + row.failed,
    }),
    { total: 0, delivered: 0, bounced: 0, failed: 0 },
  );

  const overallDeliveryRate =
    totals.total > 0 ? (totals.delivered / totals.total) * 100 : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Usage</h2>
          <p className="text-sm text-muted-foreground">
            Monitor email sending activity across your API keys
          </p>
        </div>
        <Select
          value={days.toString()}
          onValueChange={(v) => setDays(Number(v))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Emails
            </CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {totals.total.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivered
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-green-600">
              {totals.delivered.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bounced
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-red-600">
              {totals.bounced.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivery Rate
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {overallDeliveryRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Usage Chart */}
      {data.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-end gap-1">
              {data.daily.map((day, idx) => {
                const maxTotal = Math.max(...data.daily.map((d) => d.total));
                const height = maxTotal > 0 ? (day.total / maxTotal) * 100 : 0;
                const deliveredHeight =
                  day.total > 0 ? (day.delivered / day.total) * height : 0;

                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center group relative"
                  >
                    <div className="w-full flex flex-col-reverse" style={{ height: "160px" }}>
                      <div
                        className="w-full bg-green-500 rounded-t transition-all"
                        style={{ height: `${deliveredHeight}%` }}
                      />
                      <div
                        className="w-full bg-red-400 transition-all"
                        style={{ height: `${height - deliveredHeight}%` }}
                      />
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-popover border rounded-md shadow-lg p-2 text-xs z-10 whitespace-nowrap">
                      <div className="font-medium">{day.date}</div>
                      <div>Total: {day.total.toLocaleString()}</div>
                      <div className="text-green-600">
                        Delivered: {day.delivered.toLocaleString()}
                      </div>
                      <div className="text-red-600">
                        Bounced: {day.bounced.toLocaleString()}
                      </div>
                    </div>
                    {/* Date label - show for some days */}
                    {(idx === 0 ||
                      idx === data.daily.length - 1 ||
                      idx % Math.ceil(data.daily.length / 7) === 0) && (
                      <span className="text-[10px] text-muted-foreground mt-1 rotate-45 origin-left">
                        {day.date.slice(5)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded" />
                <span>Delivered</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-400 rounded" />
                <span>Bounced/Failed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage by API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage by API Key</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byKey.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No email activity in the selected period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>API Key</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Bounced</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Delivery Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byKey.map((row, idx) => (
                  <TableRow key={row.apiId ?? `direct-${idx}`}>
                    <TableCell className="font-medium">
                      {row.apiName}
                      {!row.apiId && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Campaigns
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.total.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {row.delivered.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      {row.bounced.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-orange-600">
                      {row.failed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          row.deliveryRate >= 95
                            ? "default"
                            : row.deliveryRate >= 90
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {row.deliveryRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
