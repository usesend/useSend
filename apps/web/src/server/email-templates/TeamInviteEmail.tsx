import React from "react";
import { Container, Text } from "jsx-email";
import { render } from "jsx-email";
import { EmailLayout } from "./components/EmailLayout";
import { EmailHeader } from "./components/EmailHeader";
import { EmailFooter } from "./components/EmailFooter";
import { EmailButton } from "./components/EmailButton";

interface TeamInviteEmailProps {
  teamName: string;
  inviteUrl: string;
  inviterName?: string;
  logoUrl?: string;
  role?: string;
}

export function TeamInviteEmail({
  teamName,
  inviteUrl,
  inviterName,
  logoUrl,
  role = "member",
}: TeamInviteEmailProps) {
  return (
    <EmailLayout preview={`You've been invited to join ${teamName} on useSend`}>
      <EmailHeader logoUrl={logoUrl} title="You're invited!" />

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
          Hi there,
        </Text>

        <Text
          style={{
            fontSize: "16px",
            color: "#374151",
            margin: "0 0 32px 0",
            lineHeight: "1.6",
            textAlign: "left" as const,
          }}
        >
          {inviterName
            ? `${inviterName} has invited you to join `
            : "You have been invited to join "}
          <strong style={{ color: "#000000" }}>{teamName}</strong> on useSend
          {role && role !== "member" && (
            <span>
              {" "}
              as a <strong style={{ color: "#000000" }}>{role}</strong>
            </span>
          )}
          .
        </Text>

        <Container style={{ margin: "0 0 32px 0", textAlign: "left" as const }}>
          <EmailButton href={inviteUrl}>Accept invitation</EmailButton>
        </Container>

        <Text
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: "0",
            lineHeight: "1.5",
            textAlign: "left" as const,
          }}
        >
          If you weren't expecting this invitation or don't want to join this
          team, you can safely ignore this email.
        </Text>
      </Container>

      <EmailFooter />
    </EmailLayout>
  );
}

export async function renderTeamInviteEmail(
  props: TeamInviteEmailProps
): Promise<string> {
  return render(<TeamInviteEmail {...props} />);
}
