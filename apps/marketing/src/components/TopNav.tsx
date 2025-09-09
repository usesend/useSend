"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@usesend/ui/src/button";

const REPO = "usesend/usesend";
const REPO_URL = `https://github.com/${REPO}`;
const APP_URL = "https://app.usesend.com";

export function TopNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const pricingHref = isHome ? "#pricing" : "/#pricing";

  return (
    <header className="py-4 border-b border-border sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-sidebar-background/80">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between gap-4 text-sm">
        <Link href="/" className="flex items-center gap-2 group">
          <Image src="/logo-squircle.png" alt="useSend" width={24} height={24} />
          <span className="text-primary font-mono text-[16px] group-hover:opacity-90">useSend</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-4 text-muted-foreground">
          <Link href={pricingHref} className="hover:text-foreground">
            Pricing
          </Link>
          <a
            href="https://docs.usesend.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Docs
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
          <Button size="sm" className="ml-2">
            <a href={APP_URL} target="_blank" rel="noopener noreferrer">
              Get started
            </a>
          </Button>
        </nav>

        {/* Mobile hamburger */}
        <button
          aria-label="Open menu"
          className="sm:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-border"
          onClick={() => setOpen((v) => !v)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            {open ? (
              <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu panel */}
      {open ? (
        <div className="sm:hidden border-t border-border bg-sidebar-background/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-6 py-3 flex flex-col gap-2">
            <Link href={pricingHref} className="py-2 text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
              Pricing
            </Link>
            <a
              href="https://docs.usesend.com"
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Docs
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              GitHub
            </a>
            <div className="pt-2">
              <Button className="w-full">
                <a href={APP_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                  Get started
                </a>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
