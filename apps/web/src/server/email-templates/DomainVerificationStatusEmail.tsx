import React from "react";
import { Container, Text } from "jsx-email";
import { render } from "jsx-email";
import { DomainStatus } from "@prisma/client";
import { EmailButton } from "~/server/email-templates/components/EmailButton";
import { EmailFooter } from "~/server/email-templates/components/EmailFooter";
import { EmailHeader } from "~/server/email-templates/components/EmailHeader";
import { EmailLayout } from "~/server/email-templates/components/EmailLayout";

interface DomainVerificationStatusEmailProps {
  domainName: string;
  currentStatus: DomainStatus;
  previousStatus: DomainStatus;
  verificationError?: string | null;
  domainUrl: string;
}

function formatDomainStatus(status: DomainStatus) {
  return status.toLowerCase().replaceAll("_", " ");
}

function getTitle(currentStatus: DomainStatus, previousStatus: DomainStatus) {
  if (currentStatus === DomainStatus.SUCCESS) {
    return previousStatus === DomainStatus.SUCCESS
      ? "Domain verification checked"
      : "Your domain is verified";
  }

  if (previousStatus === DomainStatus.SUCCESS) {
    return "Your domain status changed";
  }

  return "Your domain verification needs attention";
}

export function DomainVerificationStatusEmail({
  domainName,
  currentStatus,
  previousStatus,
  verificationError,
  domainUrl,
}: DomainVerificationStatusEmailProps) {
  const isSuccess = currentStatus === DomainStatus.SUCCESS;
  const preview = `${domainName} is now ${formatDomainStatus(currentStatus)}`;

  return (
    <EmailLayout preview={preview}>
      <EmailHeader title={getTitle(currentStatus, previousStatus)} />

      <Container style={{ padding: "20px 0", textAlign: "left" as const }}>
        <Text
          style={{
            fontSize: "16px",
            color: "#374151",
            margin: "0 0 16px 0",
            lineHeight: "1.6",
            textAlign: "left" as const,
          }}
        >
          Hey,
        </Text>

        {isSuccess ? (
          <Text
            style={{
              fontSize: "15px",
              color: "#4b5563",
              margin: "0 0 16px 0",
              lineHeight: "1.6",
              textAlign: "left" as const,
            }}
          >
            Your domain <strong>{domainName}</strong> is now verified, and you
            can start sending emails.
          </Text>
        ) : (
          <Text
            style={{
              fontSize: "15px",
              color: "#4b5563",
              margin: "0 0 16px 0",
              lineHeight: "1.6",
              textAlign: "left" as const,
            }}
          >
            Your domain <strong>{domainName}</strong> could not be verified
            because the DNS records are not set up correctly yet. Please review
            your DNS settings and try again.
          </Text>
        )}

        {verificationError ? (
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
              Verification error: {verificationError}
            </Text>
          </Container>
        ) : null}

        <Text
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: "0 0 24px 0",
            lineHeight: "1.6",
            textAlign: "left" as const,
          }}
        >
          Open your domain settings to review records and verification details.
        </Text>

        <Container style={{ margin: "0 0 32px 0", textAlign: "left" as const }}>
          <EmailButton href={domainUrl}>Open domain settings</EmailButton>
        </Container>

        <Text
          style={{
            fontSize: "14px",
            color: "#6b7280",
            margin: "0",
            lineHeight: "1.6",
            textAlign: "left" as const,
          }}
        >
          Thanks,
          <br />
          useSend Team
        </Text>
      </Container>

      <EmailFooter />
    </EmailLayout>
  );
}

export async function renderDomainVerificationStatusEmail(
  props: DomainVerificationStatusEmailProps,
): Promise<string> {
  return render(<DomainVerificationStatusEmail {...props} />);
}
