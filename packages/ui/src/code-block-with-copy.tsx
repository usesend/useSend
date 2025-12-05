"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";
import { Copy } from "lucide-react";
interface CodeBlockWithCopyProps {
  code: string;
  children: React.ReactNode;
  className?: string;
}

export function CodeBlockWithCopy({
  code,
  children,
  className,
}: CodeBlockWithCopyProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  return (
    <div className={cn("relative group", className)}>
      {children}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity",
          "bg-background/80 backdrop-blur-sm hover:bg-background/90 border border-border/50"
        )}
        onClick={copyToClipboard}
        aria-label="Copy code"
      >
        {isCopied ? (
          <CheckIcon className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

