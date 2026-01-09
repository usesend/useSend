"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import { Eye, Monitor, Smartphone } from "lucide-react";
import { Spinner } from "@usesend/ui/src/spinner";
import { toast } from "@usesend/ui/src/toaster";
import { ToggleGroup, ToggleGroupItem } from "@usesend/ui/src/toggle-group";

interface TemplatePreviewProps {
  json: Record<string, unknown> | undefined;
  subject: string;
}

type ViewMode = "desktop" | "mobile";

export function TemplatePreview({ json, subject }: TemplatePreviewProps) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && json) {
      await loadPreview();
    }
  };

  const loadPreview = async () => {
    if (!json) {
      toast.error("No template content to preview");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/to-html", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(json),
      });

      if (!response.ok) {
        throw new Error("Failed to render template");
      }

      const result = await response.json();
      setHtml(result.data);
    } catch (error) {
      toast.error("Failed to load preview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" />
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>Email Preview</DialogTitle>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => value && setViewMode(value as ViewMode)}
              className="mr-8"
            >
              <ToggleGroupItem value="desktop" aria-label="Desktop view">
                <Monitor className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="mobile" aria-label="Mobile view">
                <Smartphone className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {subject && (
            <div className="text-sm text-muted-foreground mt-2">
              Subject: {subject}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden mt-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner className="w-8 h-8" />
            </div>
          ) : html ? (
            <div
              className={`h-full mx-auto transition-all duration-300 ${
                viewMode === "mobile" ? "max-w-[375px]" : "max-w-full"
              }`}
            >
              <div className="h-full border rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={html}
                  className="w-full h-full"
                  sandbox="allow-same-origin"
                  title="Email Preview"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No preview available
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
