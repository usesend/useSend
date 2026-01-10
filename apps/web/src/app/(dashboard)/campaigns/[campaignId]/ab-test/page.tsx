"use client";

import { use, useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import { Badge } from "@usesend/ui/src/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@usesend/ui/src/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
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
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Trophy } from "lucide-react";
import { ABTestWinnerCriteria } from "@prisma/client";

export default function ABTestPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);

  const campaignQuery = api.campaign.getCampaign.useQuery({ campaignId });
  const abTestQuery = api.abTest.getForCampaign.useQuery({ campaignId });
  const utils = api.useUtils();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [testName, setTestName] = useState("");
  const [winnerCriteria, setWinnerCriteria] =
    useState<ABTestWinnerCriteria>("OPEN_RATE");
  const [testPercentage, setTestPercentage] = useState(20);
  const [testDurationHours, setTestDurationHours] = useState(4);
  const [variants, setVariants] = useState([
    { name: "A", subject: "", previewText: "" },
    { name: "B", subject: "", previewText: "" },
  ]);

  const createMutation = api.abTest.create.useMutation({
    onSuccess: () => {
      toast.success("A/B test created");
      utils.abTest.getForCampaign.invalidate({ campaignId });
      setShowCreateForm(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const selectWinnerMutation = api.abTest.selectWinner.useMutation({
    onSuccess: () => {
      toast.success("Winner selected");
      utils.abTest.getForCampaign.invalidate({ campaignId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = api.abTest.delete.useMutation({
    onSuccess: () => {
      toast.success("A/B test deleted");
      utils.abTest.getForCampaign.invalidate({ campaignId });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (campaignQuery.isLoading || abTestQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  const campaign = campaignQuery.data;
  const abTest = abTestQuery.data;

  if (!campaign) {
    return <div>Campaign not found</div>;
  }

  const addVariant = () => {
    if (variants.length >= 5) return;
    const nextLetter = String.fromCharCode(65 + variants.length);
    setVariants([...variants, { name: nextLetter, subject: "", previewText: "" }]);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 2) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (
    index: number,
    field: "subject" | "previewText",
    value: string
  ) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const handleCreate = () => {
    if (!testName.trim()) {
      toast.error("Please enter a test name");
      return;
    }
    if (variants.some((v) => !v.subject.trim())) {
      toast.error("All variants must have a subject line");
      return;
    }

    createMutation.mutate({
      campaignId,
      name: testName,
      winnerCriteria,
      testPercentage,
      testDurationHours,
      variants: variants.map((v) => ({
        name: v.name,
        subject: v.subject,
        previewText: v.previewText,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/campaigns">Campaigns</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/campaigns/${campaignId}`}>{campaign.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>A/B Test</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {!abTest && !showCreateForm ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No A/B Test</h3>
            <p className="text-muted-foreground mb-4">
              Create an A/B test to compare different subject lines and optimize
              your campaign performance.
            </p>
            {campaign.status === "DRAFT" ? (
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create A/B Test
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                A/B tests can only be created for draft campaigns.
              </p>
            )}
          </CardContent>
        </Card>
      ) : !abTest && showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Create A/B Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Test Name</label>
              <Input
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Subject line test"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Winner Criteria</label>
                <Select
                  value={winnerCriteria}
                  onValueChange={(v) =>
                    setWinnerCriteria(v as ABTestWinnerCriteria)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN_RATE">Open Rate</SelectItem>
                    <SelectItem value="CLICK_RATE">Click Rate</SelectItem>
                    <SelectItem value="MANUAL">Manual Selection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Test Size (%)</label>
                <Select
                  value={String(testPercentage)}
                  onValueChange={(v) => setTestPercentage(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                    <SelectItem value="30">30%</SelectItem>
                    <SelectItem value="40">40%</SelectItem>
                    <SelectItem value="50">50%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Test Duration</label>
                <Select
                  value={String(testDurationHours)}
                  onValueChange={(v) => setTestDurationHours(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="4">4 hours</SelectItem>
                    <SelectItem value="8">8 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="48">48 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Variants</label>
                {variants.length < 5 && (
                  <Button variant="outline" size="sm" onClick={addVariant}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Variant
                  </Button>
                )}
              </div>

              {variants.map((variant, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-start gap-4">
                    <Badge variant="outline" className="text-lg px-3 py-1">
                      {variant.name}
                    </Badge>
                    <div className="flex-1 space-y-3">
                      <Input
                        placeholder="Subject line"
                        value={variant.subject}
                        onChange={(e) =>
                          updateVariant(index, "subject", e.target.value)
                        }
                      />
                      <Input
                        placeholder="Preview text (optional)"
                        value={variant.previewText}
                        onChange={(e) =>
                          updateVariant(index, "previewText", e.target.value)
                        }
                      />
                    </div>
                    {variants.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVariant(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                isLoading={createMutation.isPending}
              >
                Create A/B Test
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : abTest ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{abTest.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {abTest.testPercentage}% test size |{" "}
                    {abTest.testDurationHours}h duration |{" "}
                    {abTest.winnerCriteria.replace("_", " ").toLowerCase()}{" "}
                    criteria
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      abTest.status === "COMPLETED"
                        ? "default"
                        : abTest.status === "RUNNING"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {abTest.status}
                  </Badge>
                  {abTest.status === "DRAFT" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: abTest.id })}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {abTest.variants.map((variant) => (
              <Card
                key={variant.id}
                className={variant.isWinner ? "border-green ring-2 ring-green/20" : ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-lg px-3">
                      {variant.name}
                    </Badge>
                    {variant.isWinner && (
                      <Badge className="bg-green text-white">
                        <Trophy className="h-3 w-3 mr-1" />
                        Winner
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Subject</p>
                    <p className="font-medium">{variant.subject}</p>
                  </div>
                  {variant.previewText && (
                    <div>
                      <p className="text-sm text-muted-foreground">Preview</p>
                      <p className="text-sm">{variant.previewText}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-2xl font-bold">
                        {variant.openRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Open Rate</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {variant.clickRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Click Rate</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sent</span>
                      <span className="font-mono">{variant.sent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivered</span>
                      <span className="font-mono">{variant.delivered}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Opened</span>
                      <span className="font-mono">{variant.opened}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Clicked</span>
                      <span className="font-mono">{variant.clicked}</span>
                    </div>
                  </div>

                  {abTest.status === "RUNNING" &&
                    !variant.isWinner &&
                    abTest.winnerCriteria === "MANUAL" && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          selectWinnerMutation.mutate({
                            abTestId: abTest.id,
                            variantId: variant.id,
                          })
                        }
                        disabled={selectWinnerMutation.isPending}
                      >
                        Select as Winner
                      </Button>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
