"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Textarea } from "@usesend/ui/src/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@usesend/ui/src/tabs";
import { toast } from "@usesend/ui/src/toaster";
import { SequenceStepType } from "@prisma/client";
import { Mail, Clock, GitBranch, Target } from "lucide-react";

interface AddStepDialogProps {
  sequenceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  afterStepId?: string;
}

export function AddStepDialog({
  sequenceId,
  open,
  onOpenChange,
  afterStepId,
}: AddStepDialogProps) {
  const utils = api.useUtils();

  const [stepType, setStepType] = useState<SequenceStepType>("EMAIL");
  const [name, setName] = useState("");

  // Email fields
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [html, setHtml] = useState("");
  const [templateId, setTemplateId] = useState<string | undefined>();

  // Delay fields
  const [delayDuration, setDelayDuration] = useState(1);
  const [delayUnit, setDelayUnit] = useState<"minutes" | "hours" | "days">(
    "days"
  );

  // Condition fields
  const [conditionType, setConditionType] = useState("opened");

  // Goal fields
  const [goalType, setGoalType] = useState("clicked");

  const templatesQuery = api.template.getAll.useQuery();

  const addStepMutation = api.sequence.addStep.useMutation({
    onSuccess: () => {
      toast.success("Step added");
      utils.sequence.get.invalidate({ id: sequenceId });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setStepType("EMAIL");
    setName("");
    setSubject("");
    setPreviewText("");
    setHtml("");
    setTemplateId(undefined);
    setDelayDuration(1);
    setDelayUnit("days");
    setConditionType("opened");
    setGoalType("clicked");
  };

  const handleAdd = () => {
    const baseData = {
      sequenceId,
      type: stepType,
      name: name.trim() || undefined,
      afterStepId,
    };

    if (stepType === "EMAIL") {
      if (!subject.trim() && !templateId) {
        toast.error("Please enter a subject line or select a template");
        return;
      }
      addStepMutation.mutate({
        ...baseData,
        subject: subject.trim() || undefined,
        previewText: previewText.trim() || undefined,
        html: html.trim() || undefined,
        templateId,
      });
    } else if (stepType === "DELAY") {
      addStepMutation.mutate({
        ...baseData,
        delayDuration,
        delayUnit,
      });
    } else if (stepType === "CONDITION") {
      addStepMutation.mutate({
        ...baseData,
        conditionType,
      });
    } else if (stepType === "GOAL") {
      addStepMutation.mutate({
        ...baseData,
        goalType,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Step</DialogTitle>
          <DialogDescription>
            Add a new step to your automation sequence.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={stepType}
          onValueChange={(v) => setStepType(v as SequenceStepType)}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="EMAIL" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="DELAY" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Delay
            </TabsTrigger>
            <TabsTrigger value="CONDITION" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Condition
            </TabsTrigger>
            <TabsTrigger value="GOAL" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Goal
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Step Name (optional)
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome email"
              />
            </div>

            <TabsContent value="EMAIL" className="space-y-4 mt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Use Template (optional)
                </label>
                <Select
                  value={templateId || "none"}
                  onValueChange={(v) =>
                    setTemplateId(v === "none" ? undefined : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {templatesQuery.data?.templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!templateId && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject Line</label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Welcome to our community!"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Preview Text (optional)
                    </label>
                    <Input
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      placeholder="Here's what you can expect..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Email Content (HTML)
                    </label>
                    <Textarea
                      value={html}
                      onChange={(e) => setHtml(e.target.value)}
                      placeholder="<p>Hello {{firstName}},</p>"
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="DELAY" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Duration</label>
                  <Input
                    type="number"
                    min={1}
                    value={delayDuration}
                    onChange={(e) => setDelayDuration(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unit</label>
                  <Select
                    value={delayUnit}
                    onValueChange={(v) =>
                      setDelayUnit(v as "minutes" | "hours" | "days")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Wait {delayDuration} {delayUnit} before proceeding to the next
                step.
              </p>
            </TabsContent>

            <TabsContent value="CONDITION" className="space-y-4 mt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">Condition Type</label>
                <Select value={conditionType} onValueChange={setConditionType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opened">Opened previous email</SelectItem>
                    <SelectItem value="not_opened">
                      Did not open previous email
                    </SelectItem>
                    <SelectItem value="clicked">
                      Clicked link in previous email
                    </SelectItem>
                    <SelectItem value="not_clicked">
                      Did not click link in previous email
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                Branch the sequence based on contact behavior.
              </p>
            </TabsContent>

            <TabsContent value="GOAL" className="space-y-4 mt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">Goal Type</label>
                <Select value={goalType} onValueChange={setGoalType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clicked">Clicked a link</SelectItem>
                    <SelectItem value="replied">Replied to email</SelectItem>
                    <SelectItem value="purchased">Made a purchase</SelectItem>
                    <SelectItem value="converted">
                      Completed conversion
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                Exit contacts from the sequence when they reach this goal.
              </p>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={addStepMutation.isPending}
            isLoading={addStepMutation.isPending}
          >
            Add Step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
