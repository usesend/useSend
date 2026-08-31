import { describe, it, expect, vi } from "vitest";
import { buildSnsStringToSign } from "~/server/aws/sns-message-validator";
import { SnsNotificationMessage } from "~/types/aws-types";

describe("buildSnsStringToSign", () => {
  it("uses the SNS canonical field order", () => {
    const message: SnsNotificationMessage = {
      Type: "Notification",
      MessageId: "12345",
      TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
      Subject: "Test Subject",
      Message: "Test Message",
      Timestamp: "2024-01-01T00:00:00Z",
      SignatureVersion: "1",
      Signature: "fake-signature",
      SigningCertURL: "https://example.com/cert.pem",
      UnsubscribeURL: "https://example.com/unsubscribe"
    };

    const result = buildSnsStringToSign(message);

    // The canonical form should include each field with its value, each terminated by a newline
    // including the final value
    const expected =
      "Message\nTest Message\n" +
      "MessageId\n12345\n" +
      "Subject\nTest Subject\n" +
      "Timestamp\n2024-01-01T00:00:00Z\n" +
      "TopicArn\narn:aws:sns:us-east-1:123456789012:test-topic\n" +
      "Type\nNotification\n";

    expect(result).toBe(expected);
  });

  it("omits fields with undefined values", () => {
    const message: SnsNotificationMessage = {
      Type: "Notification",
      MessageId: "12345",
      TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
      Message: "Test Message",
      Timestamp: "2024-01-01T00:00:00Z",
      SignatureVersion: "1",
      Signature: "fake-signature",
      SigningCertURL: "https://example.com/cert.pem",
      UnsubscribeURL: "https://example.com/unsubscribe"
      // Subject is intentionally omitted (undefined)
    };

    const result = buildSnsStringToSign(message);

    // Subject field should not be in the result
    expect(result).not.toContain("Subject");

    const expected =
      "Message\nTest Message\n" +
      "MessageId\n12345\n" +
      "Timestamp\n2024-01-01T00:00:00Z\n" +
      "TopicArn\narn:aws:sns:us-east-1:123456789012:test-topic\n" +
      "Type\nNotification\n";

    expect(result).toBe(expected);
  });

  it("terminates the final value with a newline", () => {
    const message: SnsNotificationMessage = {
      Type: "Notification",
      MessageId: "12345",
      TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
      Message: "Test Message",
      Timestamp: "2024-01-01T00:00:00Z",
      SignatureVersion: "1",
      Signature: "fake-signature",
      SigningCertURL: "https://example.com/cert.pem",
      UnsubscribeURL: "https://example.com/unsubscribe"
    };

    const result = buildSnsStringToSign(message);

    // The string must end with a newline (this was the original bug)
    expect(result).toMatch(/\n$/);
  });

  it("correctly signs and verifies against independently known string", () => {
    // This test uses a known string and independently verifies it can be signed/verified
    // The canonical form has each field name and value separated by newlines,
    // with a newline after each value
    const canonicalString =
      "Message\nTest Message\n" +
      "MessageId\n12345\n" +
      "Timestamp\n2024-01-01T00:00:00Z\n" +
      "TopicArn\narn:aws:sns:us-east-1:123456789012:test-topic\n" +
      "Type\nNotification\n";

    const message: SnsNotificationMessage = {
      Type: "Notification",
      MessageId: "12345",
      TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
      Message: "Test Message",
      Timestamp: "2024-01-01T00:00:00Z",
      SignatureVersion: "1",
      Signature: "",
      SigningCertURL: "https://example.com/cert.pem",
      UnsubscribeURL: "https://example.com/unsubscribe"
    };

    const result = buildSnsStringToSign(message);
    expect(result).toBe(canonicalString);
  });

  it("uses different field order for SubscriptionConfirmation messages", () => {
    const message: SnsNotificationMessage = {
      Type: "SubscriptionConfirmation",
      MessageId: "sub-123",
      TopicArn: "arn:aws:sns:us-east-1:123456789012:test-topic",
      Message: "You have chosen to subscribe to the topic...",
      Timestamp: "2024-01-01T00:00:00Z",
      Token: "token-value",
      SubscribeURL: "https://sns.amazonaws.com/?Action=ConfirmSubscription&...",
      SignatureVersion: "1",
      Signature: "fake-signature",
      SigningCertURL: "https://example.com/cert.pem"
    };

    const result = buildSnsStringToSign(message);

    // SubscriptionConfirmation uses different field order:
    // Message, MessageId, SubscribeURL, Timestamp, Token, TopicArn, Type
    const expected =
      "Message\nYou have chosen to subscribe to the topic...\n" +
      "MessageId\nsub-123\n" +
      "SubscribeURL\nhttps://sns.amazonaws.com/?Action=ConfirmSubscription&...\n" +
      "Timestamp\n2024-01-01T00:00:00Z\n" +
      "Token\ntoken-value\n" +
      "TopicArn\narn:aws:sns:us-east-1:123456789012:test-topic\n" +
      "Type\nSubscriptionConfirmation\n";

    expect(result).toBe(expected);
  });
});
