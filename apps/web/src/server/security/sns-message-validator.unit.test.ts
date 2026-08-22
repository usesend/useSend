import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  isSnsNotificationMessage,
  isTrustedSnsSubscriptionUrl,
  verifySnsMessageSignature,
} from "./sns-message-validator";
import type { SnsNotificationMessage } from "~/types/aws-types";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicKeyPem = publicKey
  .export({ type: "spki", format: "pem" })
  .toString();

function signaturePayload(message: SnsNotificationMessage) {
  const fields =
    message.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : [
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ];

  return fields
    .filter((field) => field !== "Subject" || message.Subject !== undefined)
    .map(
      (field) =>
        `${field}\n${message[field as keyof SnsNotificationMessage]}\n`,
    )
    .join("");
}

function signedMessage(
  overrides: Partial<SnsNotificationMessage> = {},
): SnsNotificationMessage {
  const message: SnsNotificationMessage = {
    Type: "Notification",
    MessageId: "11111111-2222-3333-4444-555555555555",
    TopicArn: "arn:aws:sns:eu-west-1:123456789012:usesend-events",
    Subject: "Amazon SES Email Event Notification",
    Message: '{"eventType":"Delivery"}',
    Timestamp: "2026-08-22T12:34:56.000Z",
    SignatureVersion: "2",
    Signature: "",
    SigningCertURL:
      "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-test.pem",
    ...overrides,
  };

  const signer = createSign(
    message.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256",
  );
  signer.update(signaturePayload(message), "utf8");
  signer.end();
  message.Signature = signer.sign(privateKey, "base64");
  return message;
}

describe("verifySnsMessageSignature", () => {
  it("rejects malformed payloads", async () => {
    expect(isSnsNotificationMessage(null)).toBe(false);
    await expect(verifySnsMessageSignature({})).resolves.toBe(false);
  });

  it("accepts an authentic notification", async () => {
    const fetchCertificate = vi.fn().mockResolvedValue(publicKeyPem);

    await expect(
      verifySnsMessageSignature(signedMessage(), fetchCertificate),
    ).resolves.toBe(true);
    expect(fetchCertificate).toHaveBeenCalledWith(
      new URL(
        "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-test.pem",
      ),
    );
  });

  it("accepts an authentic version 1 subscription confirmation", async () => {
    const message = signedMessage({
      Type: "SubscriptionConfirmation",
      SignatureVersion: "1",
      SubscribeURL:
        "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=test",
      Token: "test-token",
    });

    await expect(
      verifySnsMessageSignature(message, async () => publicKeyPem),
    ).resolves.toBe(true);
  });

  it("rejects a message changed after signing", async () => {
    const message = signedMessage();
    message.Message = '{"eventType":"Complaint"}';

    await expect(
      verifySnsMessageSignature(message, async () => publicKeyPem),
    ).resolves.toBe(false);
  });

  it("rejects an attacker-controlled certificate host without fetching it", async () => {
    const fetchCertificate = vi.fn().mockResolvedValue(publicKeyPem);
    const message = signedMessage({
      SigningCertURL:
        "https://sns.eu-west-1.amazonaws.com.evil.example/SimpleNotificationService-test.pem",
    });

    await expect(
      verifySnsMessageSignature(message, fetchCertificate),
    ).resolves.toBe(false);
    expect(fetchCertificate).not.toHaveBeenCalled();
  });

  it("rejects a certificate URL from a different SNS region", async () => {
    const fetchCertificate = vi.fn().mockResolvedValue(publicKeyPem);
    const message = signedMessage({
      SigningCertURL:
        "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem",
    });

    await expect(
      verifySnsMessageSignature(message, fetchCertificate),
    ).resolves.toBe(false);
    expect(fetchCertificate).not.toHaveBeenCalled();
  });
});

describe("isTrustedSnsSubscriptionUrl", () => {
  const topicArn = "arn:aws:sns:eu-west-1:123456789012:usesend-events";

  it("accepts the matching regional SNS endpoint", () => {
    expect(
      isTrustedSnsSubscriptionUrl(
        "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription",
        topicArn,
      ),
    ).toBe(true);
  });

  it("rejects lookalike and non-HTTPS endpoints", () => {
    expect(
      isTrustedSnsSubscriptionUrl(
        "https://sns.eu-west-1.amazonaws.com.evil.example/confirm",
        topicArn,
      ),
    ).toBe(false);
    expect(
      isTrustedSnsSubscriptionUrl(
        "http://sns.eu-west-1.amazonaws.com/confirm",
        topicArn,
      ),
    ).toBe(false);
  });
});
