import React from "react";
import { Container, Heading, Img } from "jsx-email";

interface EmailHeaderProps {
  logoUrl?: string;
  title?: string;
}

export function EmailHeader({ logoUrl, title }: EmailHeaderProps) {
  return (
    <Container
      style={{
        padding: "20px 0",
        textAlign: "left" as const,
      }}
    >
      {logoUrl && (
        <Img
          src={logoUrl}
          alt="useSend"
          style={{
            width: "48px",
            height: "48px",
            margin: "0 0 16px 0",
            display: "block",
          }}
        />
      )}
      {title && (
        <Heading
          style={{
            fontSize: "24px",
            fontWeight: "600",
            color: "#111827",
            margin: "0",
            lineHeight: "1.3",
            textAlign: "left" as const,
          }}
        >
          {title}
        </Heading>
      )}
    </Container>
  );
}
