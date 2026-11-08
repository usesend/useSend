"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LangToggle } from "./CodeLangToggle";

type LangItem = {
  key: string;
  label: string;
  kind: string;
};

export function CodeExampleClient({
  languages,
  panels,
}: {
  languages: LangItem[];
  panels: Record<string, ReactNode>;
}) {
  const [activeLang, setActiveLang] = useState(languages[0]?.key ?? "ts");
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => setHeight(el.scrollHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeLang]);

  return (
    <>
      <div className="flex items-center gap-2 justify-center py-2 text-xs text-muted-foreground mb-4">
        <LangToggle
          active={activeLang}
          onActiveChange={setActiveLang}
          languages={languages}
        />
      </div>
      <div className="rounded-[18px] bg-primary/20 p-1">
        <div className="rounded-[14px] bg-primary/20 p-0.5 shadow-sm">
          <div
            className="bg-background rounded-xl overflow-hidden transition-[height] duration-300 ease-in-out"
            style={height !== undefined ? { height: `${height}px` } : undefined}
          >
            <div ref={contentRef}>
              {languages.map((l) => (
                <div
                  key={l.key}
                  className={activeLang === l.key ? "block" : "hidden"}
                >
                  {panels[l.key]}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">
        Language example toggled
      </div>
    </>
  );
}

export default CodeExampleClient;
