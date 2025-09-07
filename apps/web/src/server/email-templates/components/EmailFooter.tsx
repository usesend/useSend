import React from "react";
import { Container, Text } from "jsx-email";

interface EmailFooterProps {
  companyName?: string;
  supportUrl?: string;
}

export function EmailFooter({
  companyName = "useSend",
  supportUrl = "mailto:hey@usesend.com",
}: EmailFooterProps) {
  return (
    <Container
      style={{
        padding: "20px 0",
        backgroundColor: "#ffffff",
      }}
    >
      <Text
        style={{
          fontSize: "14px",
          color: "#6b7280",
          textAlign: "left" as const,
          margin: "0",
          lineHeight: "1.5",
        }}
      >
        This email was sent by {companyName}. If you have any questions, please{" "}
        <a
          href={supportUrl}
          style={{
            color: "#000000",
            textDecoration: "underline",
          }}
        >
          contact our support team
        </a>
        .
      </Text>
    </Container>
  );
}
