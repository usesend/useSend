import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SnsNotificationMessage } from "~/types/aws-types";

const mocks = vi.hoisted(() => ({
  getTopicArns: vi.fn(),
  findSetting: vi.fn(),
  updateSetting: vi.fn(),
  invalidateCache: vi.fn(),
  queue: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    sesSetting: {
      findFirst: mocks.findSetting,
      update: mocks.updateSetting,
    },
  },
}));

vi.mock("~/server/service/ses-settings-service", () => ({
  SesSettingsService: {
    getTopicArns: mocks.getTopicArns,
    invalidateCache: mocks.invalidateCache,
  },
}));

vi.mock("~/server/service/ses-hook-parser", () => ({
  SesHookParser: {
    queue: mocks.queue,
  },
}));

import { POST } from "./route";

const topicArn = "arn:aws:sns:eu-west-1:123456789012:usesend-events";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicKeyPem = publicKey
  .export({ type: "spki", format: "pem" })
  .toString();

function signedNotification(): SnsNotificationMessage {
  const message: SnsNotificationMessage = {
    Type: "Notification",
    MessageId: "11111111-2222-3333-4444-555555555555",
    TopicArn: topicArn,
    Subject: "Amazon SES Email Event Notification",
    Message: '{"eventType":"Delivery"}',
    Timestamp: "2026-08-22T12:34:56.000Z",
    SignatureVersion: "2",
    Signature: "",
    SigningCertURL:
      "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-test.pem",
  };
  const payload = [
    "Message",
    "MessageId",
    "Subject",
    "Timestamp",
    "TopicArn",
    "Type",
  ]
    .map(
      (field) =>
        `${field}\n${message[field as keyof SnsNotificationMessage]}\n`,
    )
    .join("");
  const signer = createSign("RSA-SHA256");
  signer.update(payload, "utf8");
  signer.end();
  message.Signature = signer.sign(privateKey, "base64");
  return message;
}

function signedSubscriptionConfirmation(): SnsNotificationMessage {
  const message: SnsNotificationMessage = {
    Type: "SubscriptionConfirmation",
    MessageId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    TopicArn: topicArn,
    Message: "You have chosen to subscribe to the topic.",
    Timestamp: "2026-08-22T12:34:56.000Z",
    SignatureVersion: "2",
    Signature: "",
    SigningCertURL:
      "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-test.pem",
    SubscribeURL:
      "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=test",
    Token: "test-token",
  };
  const payload = [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ]
    .map(
      (field) =>
        `${field}\n${message[field as keyof SnsNotificationMessage]}\n`,
    )
    .join("");
  const signer = createSign("RSA-SHA256");
  signer.update(payload, "utf8");
  signer.end();
  message.Signature = signer.sign(privateKey, "base64");
  return message;
}

function requestFor(message: SnsNotificationMessage) {
  return new Request("https://send.growthpath.systems/api/ses_callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
  });
}

describe("SES callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTopicArns.mockResolvedValue([topicArn]);
    mocks.findSetting.mockResolvedValue({ id: "setting_1" });
    mocks.updateSetting.mockResolvedValue({ id: "setting_1" });
    mocks.queue.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues a legitimately signed SNS notification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(publicKeyPem, { status: 200 })),
    );
    const message = signedNotification();

    const response = await POST(requestFor(message));

    expect(response.status).toBe(200);
    expect(mocks.queue).toHaveBeenCalledWith({
      event: { eventType: "Delivery" },
      messageId: message.MessageId,
    });
  });

  it("rejects a tampered notification before it reaches the event queue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(publicKeyPem, { status: 200 })),
    );
    const message = signedNotification();
    message.Message = '{"eventType":"Complaint"}';

    const response = await POST(requestFor(message));

    expect(response.status).toBe(401);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("does not follow a subscription URL from an unsigned request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(publicKeyPem, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const message = signedNotification();
    message.Type = "SubscriptionConfirmation";
    message.SubscribeURL = "https://internal.example/metadata";
    message.Token = "attacker-token";

    const response = await POST(requestFor(message));

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(message.SigningCertURL),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("confirms an authentic SNS subscription before recording success", async () => {
    const message = signedSubscriptionConfirmation();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(publicKeyPem, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(requestFor(message));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      message.SubscribeURL,
      expect.objectContaining({ redirect: "error" }),
    );
    expect(mocks.updateSetting).toHaveBeenCalledWith({
      where: { id: "setting_1" },
      data: { callbackSuccess: true },
    });
    expect(mocks.invalidateCache).toHaveBeenCalledOnce();
  });

  it("does not record a failed SNS subscription confirmation", async () => {
    const message = signedSubscriptionConfirmation();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(publicKeyPem, { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 500 })),
    );

    const response = await POST(requestFor(message));

    expect(response.status).toBe(502);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });
});
