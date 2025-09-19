import type { ReactNode } from "react";
import { SiteFooter } from "~/components/SiteFooter";
import { TopNav } from "~/components/TopNav";

export default function UpdateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <article className="space-y-8">{children}</article>
      </div>
      <SiteFooter />
    </main>
  );
}
