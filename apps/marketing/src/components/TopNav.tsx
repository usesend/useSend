"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  { label: "Platform", href: "/#api" },
  { label: "Senders", href: "/#senders" },
  { label: "Workflow", href: "/#workflow" },
];

export function TopNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-[#080d18]/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="OTP-AUTH home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-cyan-300 dark:bg-cyan-300 dark:text-slate-950">O</span>
          <span className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">OTP-AUTH</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link key={link.label} href={link.href} className="text-sm font-medium text-slate-600 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
              {link.label}
            </Link>
          ))}
          <Link href="/#workflow" className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200">
            Start building <span className="ml-1">→</span>
          </Link>
        </nav>

        <button
          type="button"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden dark:border-slate-700 dark:text-slate-200"
        >
          <span className="text-xl leading-none">{open ? "×" : "☰"}</span>
        </button>
      </div>

      {open ? (
        <nav className="border-t border-slate-200 bg-white px-6 py-4 md:hidden dark:border-slate-800 dark:bg-[#0d1422]">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {links.map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                {link.label}
              </Link>
            ))}
            <Link href="/#workflow" onClick={() => setOpen(false)} className="mt-2 rounded-lg bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white dark:bg-cyan-300 dark:text-slate-950">
              Start building →
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
