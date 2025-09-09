import React from "react";
import { Container, Text } from "jsx-email";
import { render } from "jsx-email";
import { EmailLayout } from "./components/EmailLayout";
import { EmailHeader } from "./components/EmailHeader";
import { EmailFooter } from "./components/EmailFooter";
import { EmailButton } from "./components/EmailButton";

interface OtpEmailProps {
  otpCode: string;
  loginUrl: string;
  hostName?: string;
  logoUrl?: string;
}

export function OtpEmail({
  otpCode,
  loginUrl,
  hostName = "useSend",
  logoUrl,
}: OtpEmailProps) {
  return (
    <EmailLayout preview={`Your verification code: ${otpCode}`}>
      <EmailHeader logoUrl={logoUrl} title="Sign in to your account" />

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
          Use the verification code below to sign in to your useSend account:
        </Text>

        <Container
          style={{
            backgroundColor: "#f8f9fa",
            padding: "16px",
            margin: "0 0 32px 0",
            textAlign: "left" as const,
          }}
        >
          <Text
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#000000",
              letterSpacing: "4px",
              margin: "0",
              fontFamily: "monospace",
              textAlign: "left" as const,
            }}
          >
            {otpCode}
          </Text>
        </Container>

        <Container style={{ margin: "0 0 32px 0", textAlign: "left" as const }}>
          <EmailButton href={loginUrl}>Sign in with one click</EmailButton>
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
          If you didn't request this email, you can safely ignore it. The
          verification code will expire automatically.
        </Text>
      </Container>

      <EmailFooter />
    </EmailLayout>
  );
}

export async function renderOtpEmail(props: OtpEmailProps): Promise<string> {
  return render(<OtpEmail {...props} />);
}
