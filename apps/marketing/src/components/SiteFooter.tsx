import Link from "next/link";
import { ArrowUpRight, Github, Mail } from "iconoir-react";

const contactUrl = "https://github.com/Abhilash-nallam/otp_auth";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#080d18]">
      <div className="mx-auto max-w-7xl px-6 py-12 sm:px-8 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-600 text-sm font-black text-slate-950">O</span>
              <span className="text-base font-bold tracking-tight text-slate-950 dark:text-white">OTP-AUTH</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-7 text-slate-600 dark:text-slate-400">
              Developer email infrastructure for OTP authentication, transactional messaging and sender identity you control.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Explore</h2>
            <div className="mt-4 flex flex-col items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <Link href="/#api" className="transition hover:text-cyan-700 dark:hover:text-cyan-300">Platform</Link>
              <Link href="/#senders" className="transition hover:text-cyan-700 dark:hover:text-cyan-300">Sender identity</Link>
              <Link href="/#workflow" className="transition hover:text-cyan-700 dark:hover:text-cyan-300">Developer workflow</Link>
              <Link href="/login" className="transition hover:text-cyan-700 dark:hover:text-cyan-300">Sign in</Link>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Connect</h2>
            <div className="mt-4 flex flex-col items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-cyan-700 dark:hover:text-cyan-300">
                <Mail className="h-4 w-4" /> View project repository <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
              <a href="https://github.com/Abhilash-nallam/otp_auth" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition hover:text-cyan-700 dark:hover:text-cyan-300">
                <Github className="h-4 w-4" /> GitHub <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-slate-200 pt-6 text-xs text-slate-400 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} OTP-AUTH. All rights reserved.</span>
          <span>Built for developers. Designed for dependable delivery.</span>
        </div>
      </div>
    </footer>
  );
}
