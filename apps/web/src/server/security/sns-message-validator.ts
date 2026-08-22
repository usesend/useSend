import { createVerify } from "node:crypto";

import type { SnsNotificationMessage } from "~/types/aws-types";

const SNS_MESSAGE_FIELDS = {
  Notification: [
    "Message",
    "MessageId",
    "Subject",
    "Timestamp",
    "TopicArn",
    "Type",
  ],
  SubscriptionConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
  UnsubscribeConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
} as const;

type SnsMessageType = keyof typeof SNS_MESSAGE_FIELDS;

export function isSnsNotificationMessage(
  value: unknown,
): value is SnsNotificationMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;
  return [
    "Type",
    "MessageId",
    "TopicArn",
    "Message",
    "Timestamp",
    "SignatureVersion",
    "Signature",
    "SigningCertURL",
  ].every((field) => typeof message[field] === "string");
}

function getSnsHostname(topicArn: string) {
  const [arn, partition, service, region] = topicArn.split(":");

  if (arn !== "arn" || service !== "sns" || !region) {
    return null;
  }

  if (partition === "aws-cn") {
    return `sns.${region}.amazonaws.com.cn`;
  }

  if (partition === "aws" || partition === "aws-us-gov") {
    return `sns.${region}.amazonaws.com`;
  }

  return null;
}

function parseTrustedSnsUrl(value: string, topicArn: string) {
  const expectedHostname = getSnsHostname(topicArn);
  if (!expectedHostname) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== expectedHostname ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function parseSigningCertificateUrl(value: string, topicArn: string) {
  const url = parseTrustedSnsUrl(value, topicArn);
  if (
    !url ||
    url.search ||
    url.hash ||
    !/^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(url.pathname)
  ) {
    return null;
  }

  return url;
}

function isSnsMessageType(value: string): value is SnsMessageType {
  return value in SNS_MESSAGE_FIELDS;
}

function buildSignaturePayload(message: SnsNotificationMessage) {
  if (!isSnsMessageType(message.Type)) {
    return null;
  }

  const fields = SNS_MESSAGE_FIELDS[message.Type];
  let payload = "";

  for (const field of fields) {
    const value = message[field];

    if (field === "Subject" && value === undefined) {
      continue;
    }

    if (typeof value !== "string") {
      return null;
    }

    payload += `${field}\n${value}\n`;
  }

  return payload;
}

async function fetchSigningCertificate(url: URL) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(
      `SNS signing certificate request failed: ${response.status}`,
    );
  }

  const certificate = await response.text();
  if (certificate.length > 100_000) {
    throw new Error("SNS signing certificate is too large");
  }

  return certificate;
}

type CertificateFetcher = typeof fetchSigningCertificate;

export function isTrustedSnsSubscriptionUrl(value: string, topicArn: string) {
  return Boolean(parseTrustedSnsUrl(value, topicArn));
}

export async function verifySnsMessageSignature(
  value: unknown,
  fetchCertificate: CertificateFetcher = fetchSigningCertificate,
) {
  if (!isSnsNotificationMessage(value)) {
    return false;
  }

  const message = value;
  if (message.SignatureVersion !== "1" && message.SignatureVersion !== "2") {
    return false;
  }

  const certificateUrl = parseSigningCertificateUrl(
    message.SigningCertURL,
    message.TopicArn,
  );
  const payload = buildSignaturePayload(message);

  if (!certificateUrl || !payload || typeof message.Signature !== "string") {
    return false;
  }

  try {
    const certificate = await fetchCertificate(certificateUrl);
    const verifier = createVerify(
      message.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256",
    );
    verifier.update(payload, "utf8");
    verifier.end();
    return verifier.verify(certificate, message.Signature, "base64");
  } catch {
    return false;
  }
}
