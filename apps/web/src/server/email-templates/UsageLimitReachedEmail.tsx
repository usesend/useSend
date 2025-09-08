import React from "react";
import { Container, Text } from "jsx-email";
import { render } from "jsx-email";
import { EmailLayout } from "./components/EmailLayout";
import { EmailHeader } from "./components/EmailHeader";
import { EmailFooter } from "./components/EmailFooter";
import { EmailButton } from "./components/EmailButton";

interface UsageLimitReachedEmailProps {
  teamName: string;
  limit: number;
  isPaidPlan: boolean;
  period?: "daily" | "monthly";
  manageUrl?: string;
  logoUrl?: string;
}

export function UsageLimitReachedEmail({
  teamName,
  limit,
  isPaidPlan,
  period = "daily",
  manageUrl = "#",
  logoUrl,
}: UsageLimitReachedEmailProps) {
  const preview = `You've reached your ${period} email limit`;

  return (
    <EmailLayout preview={preview}>
      <EmailHeader logoUrl={logoUrl} title="You've reached your email limit" />

      <Container style={{ padding: "20px 0", textAlign: "left" as const }}>
        <Text
          style={{
            fontSize: "16px",
            color: "#374151",
            margin: "0 0 24px 0",
            lineHeight: "1.6",
            textAlign: "left" as const,
          }}
        >
          Hi {teamName} team,
        </Text>

        <Text
          style={{
            fontSize: "16px",
            color: "#374151",
            margin: "0 0 16px 0",
            lineHeight: "1.6",
            textAlign: "left" as const,
          }}
        >
          You've reached your {period} limit of{" "}
          <strong style={{ color: "#000" }}>{limit.toLocaleString()}</strong>{" "}
          emails.
        </Text>

        <Container
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            padding: "12px 16px",
            margin: "0 0 24px 0",
            borderRadius: "4px",
          }}
        >
          <Text
            style={{
              margin: 0,
              color: "#991b1b",
              fontSize: 14,
              textAlign: "left" as const,
            }}
          >
            Sending is temporarily paused until your limit resets or{" "}
            {isPaidPlan ? "your team is verified" : "your plan is upgraded"}
          </Text>
        </Container>

        <Container style={{ margin: "0 0 32px 0", textAlign: "left" as const }}>
          <EmailButton href={manageUrl}>Manage plan</EmailButton>
        </Container>

        <Text
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: 0,
            lineHeight: 1.5,
            textAlign: "left" as const,
          }}
        >
          Consider{" "}
          {isPaidPlan
            ? "verifying your team by replying to this email"
            : "upgrading your plan"}
        </Text>
      </Container>

      <EmailFooter />
    </EmailLayout>
  );
}

export async function renderUsageLimitReachedEmail(
  props: UsageLimitReachedEmailProps
): Promise<string> {
  return render(<UsageLimitReachedEmail {...props} />);
}
