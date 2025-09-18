"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@usesend/ui/src/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@usesend/ui/src/form";
import { Input } from "@usesend/ui/src/input";
import { Switch } from "@usesend/ui/src/switch";
import Spinner from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { Badge } from "@usesend/ui/src/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { formatDistanceToNow } from "date-fns";

import { api } from "~/trpc/react";
import type { AppRouter } from "~/server/api/root";
import type { inferRouterOutputs } from "@trpc/server";

const searchSchema = z.object({
  query: z
    .string({ required_error: "Enter a team ID, name, domain, or member email" })
    .trim()
    .min(1, "Enter a team ID, name, domain, or member email"),
});

type SearchInput = z.infer<typeof searchSchema>;

type RouterOutputs = inferRouterOutputs<AppRouter>;
type TeamAdmin = NonNullable<RouterOutputs["admin"]["findTeam"]>;

const updateSchema = z.object({
  apiRateLimit: z.coerce.number().int().min(1).max(10_000),
  dailyEmailLimit: z.coerce.number().int().min(0).max(10_000_000),
  isBlocked: z.boolean(),
  plan: z.enum(["FREE", "BASIC"]),
});

type UpdateInput = z.infer<typeof updateSchema>;

export default function AdminTeamsPage() {
  const [team, setTeam] = useState<TeamAdmin | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchForm = useForm<SearchInput>({
    resolver: zodResolver(searchSchema),
    defaultValues: { query: "" },
  });

  const updateForm = useForm<UpdateInput>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      apiRateLimit: 1,
      dailyEmailLimit: 0,
      isBlocked: false,
      plan: "FREE",
    },
  });

  useEffect(() => {
    if (team) {
      updateForm.reset({
        apiRateLimit: team.apiRateLimit,
        dailyEmailLimit: team.dailyEmailLimit,
        isBlocked: team.isBlocked,
        plan: team.plan,
      });
    }
  }, [team, updateForm]);

  const findTeam = api.admin.findTeam.useMutation({
    onSuccess: (data) => {
      setHasSearched(true);
      if (!data) {
        setTeam(null);
        toast.info("No team found for that query");
        return;
      }
      setTeam(data);
    },
    onError: (error) => {
      toast.error(error.message ?? "Unable to search for team");
    },
  });

  const updateTeam = api.admin.updateTeamSettings.useMutation({
    onSuccess: (updated) => {
      setTeam(updated);
      updateForm.reset({
        apiRateLimit: updated.apiRateLimit,
        dailyEmailLimit: updated.dailyEmailLimit,
        isBlocked: updated.isBlocked,
        plan: updated.plan,
      });
      toast.success("Team settings updated");
    },
    onError: (error) => {
      toast.error(error.message ?? "Unable to update team settings");
    },
  });

  const onSearchSubmit = (values: SearchInput) => {
    setTeam(null);
    setHasSearched(false);
    findTeam.mutate(values);
  };

  const onUpdateSubmit = (values: UpdateInput) => {
    if (!team) return;
    updateTeam.mutate({ teamId: team.id, ...values });
  };

  return (
    <div className="space-y-8">
      <div className="rounded-lg border p-6 shadow-sm">
        <Form {...searchForm}>
          <form
            onSubmit={searchForm.handleSubmit(onSearchSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={searchForm.control}
              name="query"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team lookup</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Team ID, team name, domain, or member email"
                      autoComplete="off"
                      {...field}
                      value={field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={findTeam.isPending}>
              {findTeam.isPending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Searching...
                </>
              ) : (
                "Lookup team"
              )}
            </Button>
          </form>
        </Form>
      </div>

      {findTeam.isPending ? null : hasSearched && !team ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No team matched that query. Try another search.
        </div>
      ) : null}

      {team ? (
        <div className="space-y-6 rounded-lg border p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Team</p>
              <p className="text-xl font-semibold">{team.name}</p>
              <p className="text-xs text-muted-foreground">
                ID #{team.id} • Created {formatDistanceToNow(new Date(team.createdAt), { addSuffix: true })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Plan: {team.plan}</Badge>
              <Badge variant={team.isBlocked ? "destructive" : "outline"}>
                {team.isBlocked ? "Blocked" : "Active"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Members</h3>
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                {team.teamUsers.length ? (
                  team.teamUsers.map((member) => (
                    <div
                      key={member.user.id}
                      className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{member.user.name ?? member.user.email}</p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                      </div>
                      <Badge variant="outline">{member.role}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No members found.</p>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Domains</h3>
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                {team.domains.length ? (
                  team.domains.map((domain) => (
                    <div
                      key={domain.id}
                      className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-sm"
                    >
                      <span>{domain.name}</span>
                      <Badge variant={domain.status === "SUCCESS" ? "outline" : "secondary"}>
                        {domain.status === "SUCCESS"
                          ? "Verified"
                          : domain.status.toLowerCase()}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No domains connected.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/10 p-4">
            <p className="text-sm text-muted-foreground">
              Billing contact: {team.billingEmail ?? "Not set"}
            </p>
          </div>

          <div className="rounded-lg border p-6">
            <Form {...updateForm}>
              <form onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="grid gap-6 lg:grid-cols-2">
                <FormField
                  control={updateForm.control}
                  name="apiRateLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API rate limit</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={10000}
                          {...field}
                          value={Number.isNaN(field.value) ? 1 : field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                          disabled={updateTeam.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="dailyEmailLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily email limit</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={10_000_000}
                          {...field}
                          value={Number.isNaN(field.value) ? 0 : field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                          disabled={updateTeam.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="plan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={updateTeam.isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select plan" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FREE">Free</SelectItem>
                            <SelectItem value="BASIC">Basic</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="isBlocked"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blocked</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={updateTeam.isPending}
                          />
                          <span className="text-sm text-muted-foreground">
                            {field.value ? "Team is blocked" : "Team is active"}
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="lg:col-span-2 flex justify-end">
                  <Button type="submit" disabled={updateTeam.isPending}>
                    {updateTeam.isPending ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4" /> Saving...
                      </>
                    ) : (
                      "Update team"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
