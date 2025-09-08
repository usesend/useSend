import { NextRequest, NextResponse } from "next/server";
import {
  renderOtpEmail,
  renderTeamInviteEmail,
  renderUsageWarningEmail,
  renderUsageLimitReachedEmail,
} from "~/server/email-templates";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "otp";

  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  try {
    let html: string;

    if (type === "otp") {
      html = await renderOtpEmail({
        otpCode: "ABC123",
        loginUrl: "https://app.usesend.com/login?token=abc123",
        hostName: "useSend",
      });
    } else if (type === "invite") {
      html = await renderTeamInviteEmail({
        teamName: "My Awesome Team",
        inviteUrl: "https://app.usesend.com/join-team?inviteId=123",
        inviterName: "John Doe",
        role: "admin",
      });
    } else if (type === "usage-warning") {
      const isPaidPlan = searchParams.get("isPaidPlan") === "true";
      const period = searchParams.get("period") || "daily";

      html = await renderUsageWarningEmail({
        teamName: "Acme Inc",
        used: 8000,
        limit: 10000,
        period: period as "daily" | "monthly",
        manageUrl: "https://app.usesend.com/settings/billing",
        isPaidPlan: isPaidPlan,
      });
    } else if (type === "usage-limit") {
      const isPaidPlan = searchParams.get("isPaidPlan") === "true";
      const period = searchParams.get("period") || "daily";
      html = await renderUsageLimitReachedEmail({
        teamName: "Acme Inc",
        limit: 10000,
        period: period as "daily" | "monthly",
        manageUrl: "https://app.usesend.com/settings/billing",
        isPaidPlan: isPaidPlan,
      });
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("Error rendering email template:", error);
    return NextResponse.json(
      { error: "Failed to render email template" },
      { status: 500 }
    );
  }
}
