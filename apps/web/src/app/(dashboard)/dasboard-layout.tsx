"use client";

import { AppSidebar } from "~/components/AppSideBar";
import { SidebarInset, SidebarTrigger } from "@usesend/ui/src/sidebar";
import { SidebarProvider } from "@usesend/ui/src/sidebar";
import { useIsMobile } from "@usesend/ui/src/hooks/use-mobile";
import { UpgradeModal } from "~/components/payments/UpgradeModal";
import { FeedbackDialog } from "~/components/FeedbackDialog";
import { isCloud } from "~/utils/common";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const showFeedback = isCloud();
  const showHeader = isMobile || showFeedback;

  return (
    <div className="h-full bg-sidebar-background">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {showHeader ? (
            <header className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3">
              <div className="flex items-center">
                {isMobile ? (
                  <SidebarTrigger className="h-5 w-5 text-muted-foreground" />
                ) : null}
              </div>
              {showFeedback ? <FeedbackDialog /> : null}
            </header>
          ) : null}
          <main className="flex-1 overflow-auto p-4 xl:px-40 min-h-0">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <UpgradeModal />
    </div>
  );
}
