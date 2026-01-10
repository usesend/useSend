"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Badge } from "@usesend/ui/src/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import { Spinner } from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@usesend/ui/src/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@usesend/ui/src/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@usesend/ui/src/alert-dialog";
import { SequenceStatus, SequenceStepType } from "@prisma/client";
import {
  Plus,
  Play,
  Pause,
  Archive,
  MoreHorizontal,
  Trash2,
  Users,
  Mail,
  Clock,
  GitBranch,
  Target,
  ArrowDown,
  Settings,
} from "lucide-react";
import { AddStepDialog } from "./add-step-dialog";
import { SequenceSettingsDialog } from "./sequence-settings-dialog";
import { EnrollContactsDialog } from "./enroll-contacts-dialog";

const STATUS_COLORS: Record<SequenceStatus, string> = {
  DRAFT: "bg-gray/15 text-gray border-gray/25",
  ACTIVE: "bg-green/15 text-green border-green/25",
  PAUSED: "bg-yellow/15 text-yellow border-yellow/25",
  ARCHIVED: "bg-muted text-muted-foreground border-muted",
};

const STEP_ICONS: Record<SequenceStepType, React.ElementType> = {
  EMAIL: Mail,
  DELAY: Clock,
  CONDITION: GitBranch,
  GOAL: Target,
};

export default function SequenceDetailPage({
  params,
}: {
  params: Promise<{ sequenceId: string }>;
}) {
  const { sequenceId } = use(params);
  const router = useRouter();
  const utils = api.useUtils();

  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [afterStepId, setAfterStepId] = useState<string | undefined>();

  const sequenceQuery = api.sequence.get.useQuery({ id: sequenceId });
  const statsQuery = api.sequence.getStats.useQuery({ sequenceId });

  const updateStatusMutation = api.sequence.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Sequence status updated");
      utils.sequence.get.invalidate({ id: sequenceId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = api.sequence.delete.useMutation({
    onSuccess: () => {
      toast.success("Sequence deleted");
      router.push("/sequences");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteStepMutation = api.sequence.deleteStep.useMutation({
    onSuccess: () => {
      toast.success("Step deleted");
      utils.sequence.get.invalidate({ id: sequenceId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (sequenceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const sequence = sequenceQuery.data;
  if (!sequence) {
    return <div>Sequence not found</div>;
  }

  const stats = statsQuery.data;
  const canEdit = sequence.status === "DRAFT" || sequence.status === "PAUSED";

  const handleAddStep = (afterId?: string) => {
    setAfterStepId(afterId);
    setAddStepDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/sequences">Sequences</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{sequence.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{sequence.name}</h1>
            <Badge variant="outline" className={STATUS_COLORS[sequence.status]}>
              {sequence.status}
            </Badge>
          </div>
          {sequence.description && (
            <p className="text-muted-foreground mt-1">{sequence.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {sequence.status === "ACTIVE" && (
            <Button onClick={() => setEnrollDialogOpen(true)}>
              <Users className="h-4 w-4 mr-2" />
              Enroll Contacts
            </Button>
          )}

          {sequence.status === "DRAFT" && (
            <Button
              onClick={() =>
                updateStatusMutation.mutate({ id: sequenceId, status: "ACTIVE" })
              }
              disabled={sequence.steps.length === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}

          {sequence.status === "ACTIVE" && (
            <Button
              variant="outline"
              onClick={() =>
                updateStatusMutation.mutate({ id: sequenceId, status: "PAUSED" })
              }
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}

          {sequence.status === "PAUSED" && (
            <Button
              onClick={() =>
                updateStatusMutation.mutate({ id: sequenceId, status: "ACTIVE" })
              }
            >
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSettingsDialogOpen(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              {sequence.status !== "ARCHIVED" && (
                <DropdownMenuItem
                  onClick={() =>
                    updateStatusMutation.mutate({
                      id: sequenceId,
                      status: "ARCHIVED",
                    })
                  }
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </DropdownMenuItem>
              )}
              {(sequence.status === "DRAFT" ||
                sequence.status === "ARCHIVED") && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.enrollments.active}
              </div>
              <p className="text-sm text-muted-foreground">Active Enrollments</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.sequence.totalCompleted}
              </div>
              <p className="text-sm text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.emails.openRate.toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground">Open Rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {stats.emails.clickRate.toFixed(1)}%
              </div>
              <p className="text-sm text-muted-foreground">Click Rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Steps Builder */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sequence Steps</CardTitle>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => handleAddStep()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sequence.steps.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-1">No steps yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your first email step to start building the sequence
              </p>
              {canEdit && (
                <Button onClick={() => handleAddStep()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Step
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {sequence.steps.map((step, index) => {
                const StepIcon = STEP_ICONS[step.type];
                const stepStats = stats?.steps.find((s) => s.id === step.id);

                return (
                  <div key={step.id}>
                    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <StepIcon className="h-5 w-5 text-primary" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Step {index + 1}
                              </Badge>
                              <span className="font-medium">
                                {step.name || step.type}
                              </span>
                            </div>

                            {step.type === "EMAIL" && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Subject: {step.subject || "Not set"}
                              </p>
                            )}

                            {step.type === "DELAY" && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Wait {step.delayDuration} {step.delayUnit}
                              </p>
                            )}

                            {step.type === "CONDITION" && (
                              <p className="text-sm text-muted-foreground mt-1">
                                If {step.conditionType?.replace("_", " ")}
                              </p>
                            )}

                            {step.type === "GOAL" && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Goal: {step.goalType}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {step.type === "EMAIL" && stepStats && (
                              <div className="flex gap-4 text-xs text-muted-foreground mr-4">
                                <span>Sent: {stepStats.sent}</span>
                                <span>Opened: {stepStats.opened}</span>
                                <span>Clicked: {stepStats.clicked}</span>
                              </div>
                            )}

                            {canEdit && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() =>
                                      deleteStepMutation.mutate({
                                        stepId: step.id,
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Step
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Add step between indicator */}
                    {canEdit && index < sequence.steps.length - 1 && (
                      <div className="flex items-center justify-center py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => handleAddStep(step.id)}
                        >
                          <ArrowDown className="h-4 w-4 mr-1" />
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddStepDialog
        sequenceId={sequenceId}
        open={addStepDialogOpen}
        onOpenChange={setAddStepDialogOpen}
        afterStepId={afterStepId}
      />

      <SequenceSettingsDialog
        sequence={sequence}
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />

      <EnrollContactsDialog
        sequenceId={sequenceId}
        contactBookId={sequence.contactBookId}
        open={enrollDialogOpen}
        onOpenChange={setEnrollDialogOpen}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sequence?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              sequence and all its steps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: sequenceId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
