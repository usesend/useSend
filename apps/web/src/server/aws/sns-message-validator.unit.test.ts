import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSnsTopicRegion,
  isTrustedSnsUrl,
  verifySnsMessageSignature,
} from "~/server/aws/sns-message-validator";
import type { SnsNotificationMessage } from "~/types/aws-types";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:my-topic";

function sign(
  message: Partial<SnsNotificationMessage>,
  version: "1" | "2" = "2",
): string {
  const isSubscription =
    message.Type === "SubscriptionConfirmation" ||
    message.Type === "UnsubscribeConfirmation";

  const fieldOrder = isSubscription
    ? [
        "Message",
        "MessageId",
        "SubscribeURL",
        "Timestamp",
        "Token",
        "TopicArn",
        "Type",
      ]
    : ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];

  let canonical = "";
  for (const field of fieldOrder) {
    const value = (message as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      continue;
    }
    canonical += `${field}\n${value}\n`;
  }

  const signer = createSign(version === "1" ? "RSA-SHA1" : "RSA-SHA256");
  signer.update(canonical, "utf8");
  return signer.sign(privateKey, "base64");
}

function buildNotification(
  overrides: Partial<SnsNotificationMessage> = {},
): SnsNotificationMessage {
  const base = {
    Type: "Notification",
    MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
    TopicArn: TOPIC_ARN,
    Subject: "My First Message",
    Message: '{"notificationType":"Bounce"}',
    Timestamp: "2012-05-02T00:54:06.655Z",
    SignatureVersion: "2",
    SigningCertURL:
      "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem",
  } as SnsNotificationMessage;

  const merged = { ...base, ...overrides };
  merged.Signature = overrides.Signature ?? sign(merged, "2");
  return merged;
}

function stubCertFetch(cert: string) {
  const fetchMock = vi.fn(
    async () => new Response(cert, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSnsTopicRegion", () => {
  it("extracts the region from a topic ARN", () => {
    expect(getSnsTopicRegion(TOPIC_ARN)).toBe("us-east-1");
  });

  it("returns null for a malformed ARN", () => {
    expect(getSnsTopicRegion("not-an-arn")).toBeNull();
  });
});

describe("isTrustedSnsUrl", () => {
  it("accepts an https URL on the topic's regional SNS host", () => {
    expect(
      isTrustedSnsUrl(
        "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
        TOPIC_ARN,
      ),
    ).toBe(true);
  });

  it("rejects non-https URLs", () => {
    expect(
      isTrustedSnsUrl("http://sns.us-east-1.amazonaws.com/foo", TOPIC_ARN),
    ).toBe(false);
  });

  it("rejects a non-AWS host", () => {
    expect(isTrustedSnsUrl("https://evil.example.com/foo", TOPIC_ARN)).toBe(
      false,
    );
  });

  it("rejects an AWS SNS host in a different region than the topic", () => {
    expect(
      isTrustedSnsUrl("https://sns.us-west-2.amazonaws.com/foo", TOPIC_ARN),
    ).toBe(false);
  });
});

describe("verifySnsMessageSignature", () => {
  it("accepts a message with a valid signature", async () => {
    stubCertFetch(publicKey);
    const message = buildNotification();

    await expect(verifySnsMessageSignature(message)).resolves.toBe(true);
  });

  it("accepts a valid SubscriptionConfirmation message", async () => {
    stubCertFetch(publicKey);
    const message = buildNotification({
      Type: "SubscriptionConfirmation",
      SubscribeURL:
        "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc",
      Token: "abc",
    } as Partial<SnsNotificationMessage>);

    await expect(verifySnsMessageSignature(message)).resolves.toBe(true);
  });

  it("rejects a message whose payload was changed after signing", async () => {
    stubCertFetch(publicKey);
    const signed = buildNotification();
    const tampered = { ...signed, Message: '{"notificationType":"Complaint"}' };

    await expect(verifySnsMessageSignature(tampered)).resolves.toBe(false);
  });

  it("rejects a signature that was not produced by the fetched key", async () => {
    stubCertFetch(publicKey);
    const message = buildNotification({
      Signature: sign(
        {
          Type: "Notification",
          MessageId: "different",
          TopicArn: TOPIC_ARN,
          Message: "other",
          Timestamp: "2012-05-02T00:54:06.655Z",
        },
        "2",
      ),
    });

    await expect(verifySnsMessageSignature(message)).resolves.toBe(false);
  });

  it("rejects an unsupported signature version without fetching", async () => {
    const fetchMock = stubCertFetch(publicKey);
    const message = buildNotification({ SignatureVersion: "3" });

    await expect(verifySnsMessageSignature(message)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an untrusted SigningCertURL without fetching", async () => {
    const fetchMock = stubCertFetch(publicKey);
    const message = buildNotification({
      SigningCertURL: "https://evil.example.com/cert.pem",
    });

    await expect(verifySnsMessageSignature(message)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a message missing signature fields", async () => {
    const message = buildNotification();
    // @ts-expect-error simulate a forged message with no signature
    delete message.Signature;

    await expect(verifySnsMessageSignature(message)).resolves.toBe(false);
  });
});
