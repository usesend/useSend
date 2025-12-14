"use client";

import { useEffect, useState } from "react";
import { BundledLanguage, codeToHtml } from "shiki";
import { Check, Copy } from "lucide-react";
import { Button } from "@usesend/ui/src/button";

interface CodeDisplayProps {
  code: string;
  language?: BundledLanguage;
  className?: string;
  maxHeight?: string;
}

export function CodeDisplay({
  code,
  language = "json",
  className = "",
  maxHeight = "300px",
}: CodeDisplayProps) {
  const [html, setHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function highlight() {
      try {
        const highlighted = await codeToHtml(code, {
          lang: language,
          themes: {
            dark: "catppuccin-mocha",
            light: "catppuccin-latte",
          },
          decorations: [],
          cssVariablePrefix: "--shiki-",
        });

        if (isMounted) {
          setHtml(highlighted);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to highlight code:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    highlight();

    return () => {
      isMounted = false;
    };
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="relative rounded-lg overflow-hidden border bg-muted/50">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCopy}
          className="absolute top-2 right-2 h-8 w-8 z-10"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <pre
          className={`text-xs font-mono p-4 overflow-auto ${className}`}
          style={{ maxHeight }}
        >
          <code className="p-2">{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border">
      <Button
        size="icon"
        variant="ghost"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-8 w-8 z-10 bg-background/80 hover:bg-background"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
      <div
        className={`text-xs overflow-auto ${className} [&_pre]:p-4 [&_pre]:!m-0`}
        style={{ maxHeight }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
