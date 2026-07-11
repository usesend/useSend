import { DashboardProvider } from "~/providers/dashboard-provider";
import { AuthProvider } from "~/providers/auth-provider";
import { DashboardLayout } from "./dasboard-layout";

export const dynamic = "force-static";

export default function AuthenticatedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </DashboardProvider>
    </AuthProvider>
  );
}
