import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  state,
  mockEnv,
  mockLogger,
  mockQueue,
  mockGetTopicArns,
  mockInvalidateCache,
  mockDb,
} = vi.hoisted(() => ({
  state: {
    signatureValid: false,
    subscribeUrlTrusted: false,
    useRealValidator: false,
  },
  mockEnv: {
    NODE_ENV: "test",
    SNS_SIGNATURE_VERIFICATION: "enforce",
    AWS_SNS_ENDPOINT: undefined as string | undefined,
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

vi.mock("~/env", () => ({ env: mockEnv }));

vi.mock("~/server/logger/log", () => ({ logger: mockLogger }));

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

vi.mock("~/server/aws/sns-message-validator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/server/aws/sns-message-validator")>();
  return {
    verifySnsMessageSignature: vi.fn(async (message: SnsNotificationMessage) =>
      state.useRealValidator
        ? actual.verifySnsMessageSignature(message)
        : state.signatureValid,
    ),
    isTrustedSnsUrl: vi.fn(() => state.subscribeUrlTrusted),
  };
});

import { POST } from "~/app/api/ses_callback/route";
import {
  AWS_SIGNED_SNS_MESSAGES,
  AWS_SNS_SIGNING_CERT,
} from "~/test/fixtures/aws-sns-signed-messages";
import type { SnsNotificationMessage } from "~/types/aws-types";

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
  state.useRealValidator = false;
  mockEnv.SNS_SIGNATURE_VERIFICATION = "enforce";
  mockEnv.AWS_SNS_ENDPOINT = undefined;
  mockLogger.error.mockClear();
  mockQueue.mockClear();
});

describe("ses_callback route", () => {
  it("rejects a forged notification with an invalid signature", async () => {
    const response = await postRequest(forgedNotification());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      data: "Event is not valid",
    });
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
    mockGetTopicArns.mockResolvedValue([
      "arn:aws:sns:us-east-1:123456789012:other",
    ]);

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

  describe("custom SNS endpoint (emulators)", () => {
    const emulatorConfirmation = () => ({
      ...forgedNotification(),
      Type: "SubscriptionConfirmation",
      SubscribeURL: "http://localhost:5350",
      Token: "abc",
    });

    it("confirms the emulator's SubscribeURL in log-only mode", async () => {
      mockEnv.AWS_SNS_ENDPOINT = "http://localhost:5350/api/sns";
      mockEnv.SNS_SIGNATURE_VERIFICATION = "log-only";
      const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await postRequest(emulatorConfirmation());

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:5350",
        expect.objectContaining({ redirect: "error" }),
      );

      vi.unstubAllGlobals();
    });

    it("still requires an AWS SubscribeURL when signatures are enforced", async () => {
      mockEnv.AWS_SNS_ENDPOINT = "http://localhost:5350/api/sns";
      state.signatureValid = true;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await postRequest(emulatorConfirmation());

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it("still requires an AWS SubscribeURL in log-only mode without a custom endpoint", async () => {
      mockEnv.SNS_SIGNATURE_VERIFICATION = "log-only";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await postRequest(emulatorConfirmation());

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
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

  it("logs an error when it rejects an invalid signature", async () => {
    await postRequest(forgedNotification());

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ topicArn: TOPIC_ARN, enforced: true }),
      "Rejected SNS message with invalid signature",
    );
  });

  it("accepts an invalid signature but still logs it in log-only mode", async () => {
    mockEnv.SNS_SIGNATURE_VERIFICATION = "log-only";

    const response = await postRequest(forgedNotification());

    expect(response.status).toBe(200);
    expect(mockQueue).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ enforced: false }),
      expect.stringContaining("log-only"),
    );
  });

  it("still rejects an unconfigured topic in log-only mode", async () => {
    mockEnv.SNS_SIGNATURE_VERIFICATION = "log-only";
    mockGetTopicArns.mockResolvedValue([
      "arn:aws:sns:us-east-1:123456789012:other",
    ]);

    const response = await postRequest(forgedNotification());

    expect(response.status).toBe(401);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it("queues a genuine AWS-signed SES event end to end", async () => {
    state.useRealValidator = true;
    const message = AWS_SIGNED_SNS_MESSAGES.sesComplaintEventWithSubject;
    mockGetTopicArns.mockResolvedValue([message.TopicArn]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(AWS_SNS_SIGNING_CERT, { status: 200 })),
    );

    const response = await postRequest(message);

    expect(response.status).toBe(200);
    expect(mockQueue).toHaveBeenCalledWith({
      event: JSON.parse(message.Message),
      messageId: message.MessageId,
    });

    vi.unstubAllGlobals();
  });

  it("rejects a genuine AWS-signed SES event after tampering", async () => {
    state.useRealValidator = true;
    const message = AWS_SIGNED_SNS_MESSAGES.sesComplaintEventWithSubject;
    mockGetTopicArns.mockResolvedValue([message.TopicArn]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(AWS_SNS_SIGNING_CERT, { status: 200 })),
    );

    const response = await postRequest({
      ...message,
      Message: message.Message.replace("Complaint", "Bounce"),
    });

    expect(response.status).toBe(401);
    expect(mockQueue).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
