import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbCreate, mockDbFindUnique, mockQueueAdd } = vi.hoisted(() => ({
  mockDbCreate: vi.fn(),
  mockDbFindUnique: vi.fn(),
  mockQueueAdd: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    domain: { findUnique: mockDbFindUnique },
    inboundEmail: { create: mockDbCreate },
  },
}));

vi.mock("~/server/jobs/inbound-email-worker", () => ({
  inboundEmailQueue: { add: mockQueueAdd },
}));

vi.mock("~/server/queue/queue-constants", () => ({
  DEFAULT_QUEUE_OPTIONS: {},
}));

vi.mock("~/server/logger/log", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "production",
    INBOUND_SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789:inbound-topic",
  },
}));

import { POST } from "./route";

function makeSnsNotification(sesMessage: object): Request {
  return new Request("http://localhost/api/inbound_callback", {
    method: "POST",
    body: JSON.stringify({
      Type: "Notification",
      TopicArn: "arn:aws:sns:us-east-1:123456789:inbound-topic",
      Message: JSON.stringify(sesMessage),
    }),
  });
}

function makeSubscriptionRequest(): Request {
  return new Request("http://localhost/api/inbound_callback", {
    method: "POST",
    body: JSON.stringify({
      Type: "SubscriptionConfirmation",
      TopicArn: "arn:aws:sns:us-east-1:123456789:inbound-topic",
      SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
    }),
  });
}

describe("inbound callback route", () => {
  beforeEach(() => {
    mockDbCreate.mockReset();
    mockDbFindUnique.mockReset();
    mockQueueAdd.mockReset();
  });

  it("rejects events with wrong TopicArn", async () => {
    const req = new Request("http://localhost/api/inbound_callback", {
      method: "POST",
      body: JSON.stringify({
        Type: "Notification",
        TopicArn: "arn:aws:sns:us-east-1:wrong:bad-topic",
        Message: "{}",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toBe("Event is not valid");
    expect(mockDbCreate).not.toHaveBeenCalled();
  });

  it("ignores unknown SNS message types", async () => {
    const req = new Request("http://localhost/api/inbound_callback", {
      method: "POST",
      body: JSON.stringify({
        Type: "UnsubscribeConfirmation",
        TopicArn: "arn:aws:sns:us-east-1:123456789:inbound-topic",
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(body.data).toBe("Ignored");
  });

  it("extracts recipient from receipt.recipients", async () => {
    const sesMessage = {
      receipt: { recipients: ["Support@Example.com"] },
      mail: { source: "sender@test.com", commonHeaders: { subject: "Test" } },
    };

    mockDbFindUnique.mockResolvedValue({
      id: 1,
      name: "example.com",
      teamId: 5,
      inboundEnabled: true,
    });
    mockDbCreate.mockResolvedValue({ id: "inb_1" });
    mockQueueAdd.mockResolvedValue({});

    const res = await POST(makeSnsNotification(sesMessage));
    expect(res.status).toBe(200);

    expect(mockDbCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          to: "support@example.com",
          from: "sender@test.com",
          subject: "Test",
        }),
      })
    );
  });

  it("falls back to mail.destination for recipient", async () => {
    const sesMessage = {
      mail: {
        destination: ["Info@Domain.org"],
        source: "from@test.com",
        commonHeaders: { subject: "Hi" },
      },
    };

    mockDbFindUnique.mockResolvedValue({
      id: 2,
      name: "domain.org",
      teamId: 3,
      inboundEnabled: true,
    });
    mockDbCreate.mockResolvedValue({ id: "inb_2" });
    mockQueueAdd.mockResolvedValue({});

    const res = await POST(makeSnsNotification(sesMessage));
    expect(res.status).toBe(200);

    expect(mockDbCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          to: "info@domain.org",
        }),
      })
    );
  });

  it("drops email when domain is not found", async () => {
    const sesMessage = {
      receipt: { recipients: ["test@unknown-domain.com"] },
      mail: { source: "sender@test.com" },
    };

    mockDbFindUnique.mockResolvedValue(null);

    const res = await POST(makeSnsNotification(sesMessage));
    const body = await res.json();

    expect(body.data).toBe("Dropped");
    expect(mockDbCreate).not.toHaveBeenCalled();
  });

  it("drops email when inbound is disabled", async () => {
    const sesMessage = {
      receipt: { recipients: ["test@example.com"] },
      mail: { source: "sender@test.com" },
    };

    mockDbFindUnique.mockResolvedValue({
      id: 1,
      name: "example.com",
      teamId: 5,
      inboundEnabled: false,
    });

    const res = await POST(makeSnsNotification(sesMessage));
    const body = await res.json();

    expect(body.data).toBe("Dropped");
    expect(mockDbCreate).not.toHaveBeenCalled();
  });

  it("extracts S3 key from receipt action", async () => {
    const sesMessage = {
      receipt: {
        recipients: ["hello@example.com"],
        action: {
          type: "S3",
          objectKey: "inbound/example.com/abc123",
        },
      },
      mail: { source: "sender@test.com", commonHeaders: { subject: "S3 Test" } },
    };

    mockDbFindUnique.mockResolvedValue({
      id: 1,
      name: "example.com",
      teamId: 5,
      inboundEnabled: true,
    });
    mockDbCreate.mockResolvedValue({ id: "inb_3" });
    mockQueueAdd.mockResolvedValue({});

    await POST(makeSnsNotification(sesMessage));

    expect(mockDbCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          s3Key: "inbound/example.com/abc123",
        }),
      })
    );
  });

  it("returns 500 when database create fails", async () => {
    const sesMessage = {
      receipt: { recipients: ["test@example.com"] },
      mail: { source: "sender@test.com" },
    };

    mockDbFindUnique.mockResolvedValue({
      id: 1,
      name: "example.com",
      teamId: 5,
      inboundEnabled: true,
    });
    mockDbCreate.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeSnsNotification(sesMessage));
    expect(res.status).toBe(500);
  });

  it("returns 500 when queue add fails", async () => {
    const sesMessage = {
      receipt: { recipients: ["test@example.com"] },
      mail: { source: "sender@test.com" },
    };

    mockDbFindUnique.mockResolvedValue({
      id: 1,
      name: "example.com",
      teamId: 5,
      inboundEnabled: true,
    });
    mockDbCreate.mockResolvedValue({ id: "inb_4" });
    mockQueueAdd.mockRejectedValue(new Error("Redis down"));

    const res = await POST(makeSnsNotification(sesMessage));
    expect(res.status).toBe(500);
  });

  it("confirms SNS subscription with awaited fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 })
    );

    const res = await POST(makeSubscriptionRequest());
    const body = await res.json();

    expect(body.data).toBe("Subscription confirmed");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
      { method: "GET" }
    );
  });
});
