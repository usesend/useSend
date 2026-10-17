import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, mockQueue, mockGetTopicArns, mockInvalidateCache, mockDb } =
  vi.hoisted(() => ({
    state: {
      signatureValid: false,
      subscribeUrlTrusted: false,
    },
    mockQueue: vi.fn(),
    mockGetTopicArns: vi.fn(),
    mockInvalidateCache: vi.fn(),
    mockDb: {
      sesSetting: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
  }));

vi.mock("~/env", () => ({ env: { NODE_ENV: "test" } }));

vi.mock("~/server/db", () => ({ db: mockDb }));

vi.mock("~/server/service/ses-hook-parser", () => ({
  SesHookParser: { queue: mockQueue },
}));

vi.mock("~/server/service/ses-settings-service", () => ({
  SesSettingsService: {
    getTopicArns: mockGetTopicArns,
    invalidateCache: mockInvalidateCache,
  },
}));

vi.mock("~/server/aws/sns-message-validator", () => ({
  verifySnsMessageSignature: vi.fn(async () => state.signatureValid),
  isTrustedSnsUrl: vi.fn(() => state.subscribeUrlTrusted),
}));

import { POST } from "~/app/api/ses_callback/route";

const TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:my-topic";

function postRequest(body: unknown) {
  return POST(
    new Request("http://localhost/api/ses_callback", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

function forgedNotification() {
  return {
    Type: "Notification",
    MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
    TopicArn: TOPIC_ARN,
    Message: '{"notificationType":"Bounce"}',
    Timestamp: "2012-05-02T00:54:06.655Z",
    SignatureVersion: "2",
    Signature: "forged",
    SigningCertURL:
      "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem",
  };
}

beforeEach(() => {
  mockGetTopicArns.mockResolvedValue([TOPIC_ARN]);
  mockQueue.mockResolvedValue(true);
  mockDb.sesSetting.findFirst.mockResolvedValue({ id: "setting_1" });
  mockDb.sesSetting.update.mockResolvedValue({ id: "setting_1" });
  state.signatureValid = false;
  state.subscribeUrlTrusted = false;
});

describe("ses_callback route", () => {
  it("rejects a forged notification with an invalid signature", async () => {
    const response = await postRequest(forgedNotification());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ data: "Event is not valid" });
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it("processes a notification with a valid signature", async () => {
    state.signatureValid = true;

    const response = await postRequest(forgedNotification());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: "Success" });
    expect(mockQueue).toHaveBeenCalledTimes(1);
  });

  it("rejects a notification from an unconfigured topic", async () => {
    state.signatureValid = true;
    mockGetTopicArns.mockResolvedValue(["arn:aws:sns:us-east-1:123456789012:other"]);

    const response = await postRequest(forgedNotification());

    expect(response.status).toBe(401);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it("does not fetch an untrusted SubscribeURL", async () => {
    state.signatureValid = true;
    state.subscribeUrlTrusted = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postRequest({
      ...forgedNotification(),
      Type: "SubscriptionConfirmation",
      SubscribeURL: "https://evil.example.com/confirm",
      Token: "abc",
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("confirms a subscription with a trusted SubscribeURL", async () => {
    state.signatureValid = true;
    state.subscribeUrlTrusted = true;
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await postRequest({
      ...forgedNotification(),
      Type: "SubscriptionConfirmation",
      SubscribeURL:
        "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc",
      Token: "abc",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: "Success" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockInvalidateCache).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("rejects a malformed body with 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/ses_callback", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
  });
});
