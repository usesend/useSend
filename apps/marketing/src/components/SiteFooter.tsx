import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-[#080d18]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-cyan-300 dark:bg-cyan-300 dark:text-slate-950">O</span>
            <span className="font-semibold tracking-tight text-slate-950 dark:text-white">OTP-AUTH</span>
          </Link>
          <p className="mt-3 max-w-sm text-xs leading-6 text-slate-500 dark:text-slate-400">
            Developer email infrastructure for authentication, transactional
            messaging and sender identity.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-3 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Link href="/#api" className="transition hover:text-slate-950 dark:hover:text-white">Platform</Link>
          <Link href="/#senders" className="transition hover:text-slate-950 dark:hover:text-white">Sender identity</Link>
          <Link href="/#workflow" className="transition hover:text-slate-950 dark:hover:text-white">Workflow</Link>
          <a href="https://github.com/Abhilash-nallam/otp_auth" target="_blank" rel="noopener noreferrer" className="transition hover:text-slate-950 dark:hover:text-white">GitHub</a>
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-7xl border-t border-slate-100 px-6 pt-6 text-[11px] text-slate-400 dark:border-slate-800 sm:px-8">
        © {new Date().getFullYear()} OTP-AUTH. All rights reserved.
      </div>
    </footer>
  );
}
