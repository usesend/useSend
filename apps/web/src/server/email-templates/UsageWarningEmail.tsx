import React from "react";
import { Container, Text } from "jsx-email";
import { render } from "jsx-email";
import { EmailLayout } from "./components/EmailLayout";
import { EmailHeader } from "./components/EmailHeader";
import { EmailFooter } from "./components/EmailFooter";
import { EmailButton } from "./components/EmailButton";

interface UsageWarningEmailProps {
  teamName: string;
  used: number;
  limit: number;
  isPaidPlan: boolean;
  period?: "daily" | "monthly";
  manageUrl?: string;
  logoUrl?: string;
}

export function UsageWarningEmail({
  teamName,
  used,
  limit,
  isPaidPlan,
  period = "daily",
  manageUrl = "#",
  logoUrl,
}: UsageWarningEmailProps) {
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 80;
  const preview = `You've used ${percent}% of your ${period} email limit`;

  return (
    <EmailLayout preview={preview}>
      <EmailHeader logoUrl={logoUrl} title="You're nearing your email limit" />

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
          You've used{" "}
          <strong style={{ color: "#000" }}>{used.toLocaleString()}</strong> of
          your{" "}
          <strong style={{ color: "#000" }}>{limit.toLocaleString()}</strong>{" "}
          {period} email limit.
        </Text>

        <Container
          style={{
            backgroundColor: "#fff7ed",
            border: "1px solid #fed7aa",
            padding: "12px 16px",
            margin: "0 0 24px 0",
            borderRadius: "4px",
          }}
        >
          <Text
            style={{
              margin: 0,
              color: "#9a3412",
              fontSize: 14,
              textAlign: "left" as const,
            }}
          >
            Heads up: you're at approximately {percent}% of your limit.
          </Text>
        </Container>

        <Container style={{ margin: "0 0 32px 0", textAlign: "left" as const }}>
          <EmailButton href={manageUrl}>
            {isPaidPlan ? "Verify team" : "Upgrade"}
          </EmailButton>
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

export async function renderUsageWarningEmail(
  props: UsageWarningEmailProps
): Promise<string> {
  return render(<UsageWarningEmail {...props} />);
}
