"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Menu, Xmark } from "iconoir-react";

const links = [
  { label: "Platform", href: "/#api" },
  { label: "Senders", href: "/#senders" },
  { label: "Workflow", href: "/#workflow" },
];

const contactUrl = "https://github.com/Abhilash-nallam/otp_auth";

export function TopNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-2xl dark:border-slate-800/80 dark:bg-[#080d18]/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="OTP-AUTH home">
          <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-600 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20">
            O<span className="absolute -bottom-2 -right-1 h-5 w-5 rounded-full border-2 border-white/70 bg-blue-600 dark:border-[#080d18]" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-slate-950 dark:text-white">
            OTP<span className="text-cyan-600 dark:text-cyan-300">-</span>AUTH
            <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Email infrastructure</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
          {links.map((link) => (
            <Link key={link.label} href={link.href} className="text-sm font-medium text-slate-600 transition hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-300">
              {link.label}
            </Link>
          ))}
          <Link href={contactUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-600 transition hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-300">
            Project on GitHub
          </Link>
          <Link href="/#workflow" className="text-sm font-semibold text-slate-700 transition hover:text-cyan-700 dark:text-slate-200 dark:hover:text-cyan-300">
            Sign in
          </Link>
          <Link href="/#workflow" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200">
            Start building <ArrowUpRight className="h-4 w-4" />
          </Link>
        </nav>

        <button
          type="button"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 lg:hidden dark:border-slate-700 dark:text-slate-200"
        >
          {open ? <Xmark className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <nav className="border-t border-slate-200 bg-white px-5 py-4 lg:hidden dark:border-slate-800 dark:bg-[#0d1422]" aria-label="Mobile navigation">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {links.map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                {link.label}
              </Link>
            ))}
            <Link href={contactUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
              Project on GitHub
            </Link>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link href="/#workflow" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-100">
                Sign in
              </Link>
              <Link href="/#workflow" onClick={() => setOpen(false)} className="rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white dark:bg-cyan-300 dark:text-slate-950">
                Start building
              </Link>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
