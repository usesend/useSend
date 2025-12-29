import React from "react";
import { Container, Text } from "jsx-email";
import { render } from "jsx-email";
import { EmailLayout } from "./components/EmailLayout";
import { EmailHeader } from "./components/EmailHeader";
import { EmailFooter } from "./components/EmailFooter";
import { EmailButton } from "./components/EmailButton";

interface PasswordResetEmailProps {
  resetUrl: string;
  logoUrl?: string;
}

export function PasswordResetEmail({
  resetUrl,
  logoUrl,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Reset your password">
      <EmailHeader logoUrl={logoUrl} title="Reset your password" />

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
          We received a request to reset your password for your useSend account.
          Click the button below to create a new password:
        </Text>

        <Container style={{ margin: "0 0 32px 0", textAlign: "left" as const }}>
          <EmailButton href={resetUrl}>Reset password</EmailButton>
        </Container>

        <Text
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: "0 0 16px 0",
            lineHeight: "1.5",
            textAlign: "left" as const,
          }}
        >
          This link will expire in <strong>1 hour</strong> for security reasons.
        </Text>

        <Text
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: "0",
            lineHeight: "1.5",
            textAlign: "left" as const,
          }}
        >
          If you didn't request a password reset, you can safely ignore this
          email. Your password will remain unchanged.
        </Text>
      </Container>

      <EmailFooter />
    </EmailLayout>
  );
}

export async function renderPasswordResetEmail(
  props: PasswordResetEmailProps
): Promise<string> {
  return render(<PasswordResetEmail {...props} />);
}
