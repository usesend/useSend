"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@usesend/ui/src/button";

type LangItem = {
  key: string;
  label: string;
  kind: "ts" | "py" | string; // used for icon selection
};

export function LangToggle({
  containerId,
  languages,
  defaultLang,
}: {
  containerId: string;
  languages: LangItem[];
  defaultLang: string;
}) {
  const [active, setActive] = useState(defaultLang);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const slots = Array.from(
      container.querySelectorAll<HTMLElement>("[data-lang-slot]")
    );
    for (const el of slots) {
      const key = el.getAttribute("data-lang-slot");
      if (key === active) {
        el.classList.remove("hidden");
        el.classList.add("block");
      } else {
        el.classList.add("hidden");
        el.classList.remove("block");
      }
    }
  }, [active, containerId]);

  return (
    <div className="flex items-center gap-2 justify-center">
      {languages.map((l) => (
        <Button
          key={l.key}
          size="sm"
          variant="outline"
          className={
            "px-3 bg-transparent hover:bg-transparent hover:text-inherit " +
            (active === l.key
              ? "border-primary"
              : "border-input")
          }
          aria-pressed={active === l.key}
          onClick={() => setActive(l.key)}
        >
          <span className="inline-flex items-center">
            <LangIcon kind={l.kind} className="h-4 w-4 mr-1" /> {l.label}
          </span>
        </Button>
      ))}
    </div>
  );
}

function LangIcon({ kind, className = "h-4 w-4" }: { kind: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className} role="img">
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      </svg>
    );
  }
  if (kind === "ts")
    return (
      <Image
        src="/typescript.svg"
        alt="TypeScript logo"
        width={16}
        height={16}
        className={className}
        priority={false}
        onError={() => setFailed(true)}
      />
    );
  if (kind === "py")
    return (
      <Image
        src="/python.svg"
        alt="Python logo"
        width={16}
        height={16}
        className={className}
        priority={false}
        onError={() => setFailed(true)}
      />
    );
  if (kind === "go")
    return (
      <Image
        src="/go.svg"
        alt="Go logo"
        width={16}
        height={16}
        className={className}
        priority={false}
        onError={() => setFailed(true)}
      />
    );
  if (kind === "php")
    return (
      <Image
        src="/php.svg"
        alt="PHP logo"
        width={16}
        height={16}
        className={className}
        priority={false}
        onError={() => setFailed(true)}
      />
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} role="img">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

export default LangToggle;
