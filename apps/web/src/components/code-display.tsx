"use client";

import { useEffect, useState } from "react";
import { BundledLanguage, codeToHtml } from "shiki";

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

  if (isLoading) {
    return (
      <div className="rounded-lg overflow-hidden border bg-muted/50">
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
    <div className="rounded-lg overflow-hidden border">
      <div
        className={`text-xs overflow-auto ${className}`}
        style={{ maxHeight }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
