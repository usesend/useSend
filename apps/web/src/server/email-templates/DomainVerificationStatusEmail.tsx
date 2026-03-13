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
          {domainName} is currently{" "}
          <strong>{formatDomainStatus(currentStatus)}</strong>.
        </Text>

        {previousStatus !== currentStatus ? (
          <Text
            style={{
              fontSize: "15px",
              color: "#4b5563",
              margin: "0 0 16px 0",
              lineHeight: "1.6",
              textAlign: "left" as const,
            }}
          >
            Previous status:{" "}
            <strong>{formatDomainStatus(previousStatus)}</strong>
          </Text>
        ) : null}

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
          Review the DNS records in useSend to make sure the domain stays ready
          to send.
        </Text>

        <Container style={{ margin: "0 0 32px 0", textAlign: "left" as const }}>
          <EmailButton href={domainUrl}>Open domain settings</EmailButton>
        </Container>
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
