import { WebhookCallStatus, WebhookStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  capturedProcessWebhookCall,
  mockDb,
  mockLogger,
  mockQueueAdd,
  mockRedis,
  mockTxWebhookUpdate,
} = vi.hoisted(() => ({
  capturedProcessWebhookCall: {
    handler: null as any,
  },
  mockDb: {
    $transaction: vi.fn(),
    webhook: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    webhookCall: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockQueueAdd: vi.fn(),
  mockRedis: {
    eval: vi.fn(),
    set: vi.fn(),
  },
  mockTxWebhookUpdate: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    public add = mockQueueAdd;
  },
  Worker: class {
    public on = vi.fn();
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/logger/log", () => ({
  logger: mockLogger,
}));

vi.mock("~/server/queue/bullmq-context", () => ({
  createWorkerHandler: (handler: any) => {
    capturedProcessWebhookCall.handler = handler;
    return handler;
  },
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
}));

import { WebhookService } from "~/server/service/webhook-service";

function buildCall(overrides?: {
  consecutiveFailures?: number;
  status?: WebhookStatus;
}) {
  return {
    id: "call_123",
    webhookId: "wh_123",
    teamId: 77,
    type: "email.delivered",
    payload: JSON.stringify({ id: "email_123" }),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    webhook: {
      id: "wh_123",
      url: "https://example.com/webhook",
      secret: "whsec_test",
      apiVersion: null,
      status: overrides?.status ?? WebhookStatus.ACTIVE,
      consecutiveFailures: overrides?.consecutiveFailures ?? 0,
    },
  };
}

async function invokeProcessWebhookCall(attemptsMade = 0) {
  if (!capturedProcessWebhookCall.handler) {
    throw new Error("processWebhookCall handler not captured");
  }

  return capturedProcessWebhookCall.handler({
    attemptsMade,
    data: {
      callId: "call_123",
      teamId: 77,
    },
  });
}

describe("WebhookService documented behavior", () => {
  beforeEach(() => {
    mockDb.webhook.create.mockReset();
    mockDb.webhook.delete.mockReset();
    mockDb.webhook.findFirst.mockReset();
    mockDb.webhook.findMany.mockReset();
    mockDb.webhook.update.mockReset();

    mockDb.webhookCall.create.mockReset();
    mockDb.webhookCall.findFirst.mockReset();
    mockDb.webhookCall.findMany.mockReset();
    mockDb.webhookCall.findUnique.mockReset();
    mockDb.webhookCall.update.mockReset();

    mockDb.$transaction.mockReset();
    mockLogger.debug.mockReset();
    mockLogger.error.mockReset();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockQueueAdd.mockReset();
    mockRedis.eval.mockReset();
    mockRedis.set.mockReset();
    mockTxWebhookUpdate.mockReset();

    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);
    mockQueueAdd.mockResolvedValue(undefined);
    mockDb.webhookCall.update.mockResolvedValue({});
    mockDb.webhook.update.mockResolvedValue({
      id: "wh_123",
      status: WebhookStatus.ACTIVE,
      consecutiveFailures: 0,
    });

    mockDb.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return input({
          webhook: {
            update: mockTxWebhookUpdate,
          },
        });
      }

      return Promise.all(input as Array<Promise<unknown>>);
    });
  });

  it("sends documented webhook headers with retry=false on first attempt", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(buildCall());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    await expect(invokeProcessWebhookCall(0)).resolves.toBeUndefined();

    const [, request] = fetchSpy.mock.calls[0]!;
    const headers = request!.headers as Record<string, string>;
    expect(headers["X-UseSend-Event"]).toBe("email.delivered");
    expect(headers["X-UseSend-Call"]).toBe("call_123");
    expect(headers["X-UseSend-Signature"]).toMatch(/^v1=/);
    expect(headers["X-UseSend-Timestamp"]).toBeTypeOf("string");
    expect(headers["X-UseSend-Retry"]).toBe("false");
  });

  it("sets retry=true header for retry attempts", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(buildCall());

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain",
        },
      }),
    );

    await expect(invokeProcessWebhookCall(1)).resolves.toBeUndefined();

    const [, request] = fetchSpy.mock.calls[0]!;
    const headers = request!.headers as Record<string, string>;
    expect(headers["X-UseSend-Retry"]).toBe("true");
  });

  it("marks webhook call as FAILED after 6 attempts", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(buildCall());
    mockTxWebhookUpdate.mockResolvedValue({
      id: "wh_123",
      status: WebhookStatus.ACTIVE,
      consecutiveFailures: 1,
    });

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    await expect(invokeProcessWebhookCall(5)).rejects.toThrow("network down");

    expect(mockDb.webhookCall.update).toHaveBeenLastCalledWith({
      where: { id: "call_123" },
      data: expect.objectContaining({
        status: WebhookCallStatus.FAILED,
        attempt: 6,
        nextAttemptAt: null,
      }),
    });
  });

  it("does not increment consecutive failure counter before final attempt", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(buildCall());
    mockTxWebhookUpdate.mockResolvedValue({
      id: "wh_123",
      status: WebhookStatus.ACTIVE,
      consecutiveFailures: 0,
    });

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    await expect(invokeProcessWebhookCall(0)).rejects.toThrow("network down");

    expect(mockTxWebhookUpdate).toHaveBeenCalledTimes(1);
    const firstUpdateInput = mockTxWebhookUpdate.mock.calls[0]![0] as {
      data: { consecutiveFailures?: { increment: number } };
    };
    expect(firstUpdateInput.data.consecutiveFailures).toBeUndefined();
    expect(mockDb.webhookCall.update).toHaveBeenLastCalledWith({
      where: { id: "call_123" },
      data: expect.objectContaining({
        status: WebhookCallStatus.PENDING,
        attempt: 1,
      }),
    });
  });

  it("auto-disables only when the persisted failure count reaches 30", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(
      buildCall({ consecutiveFailures: 29 }),
    );
    mockTxWebhookUpdate
      .mockResolvedValueOnce({
        id: "wh_123",
        status: WebhookStatus.ACTIVE,
        consecutiveFailures: 30,
      })
      .mockResolvedValueOnce({
        id: "wh_123",
        status: WebhookStatus.AUTO_DISABLED,
        consecutiveFailures: 30,
      });

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("endpoint 500"));

    await expect(invokeProcessWebhookCall(5)).resolves.toBeUndefined();

    expect(mockTxWebhookUpdate).toHaveBeenCalledTimes(2);
    expect(mockTxWebhookUpdate).toHaveBeenLastCalledWith({
      where: { id: "wh_123" },
      data: {
        status: WebhookStatus.AUTO_DISABLED,
      },
    });
  });

  it("uses the latest persisted failure count when deciding auto-disable", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(
      buildCall({ consecutiveFailures: 29 }),
    );
    mockTxWebhookUpdate.mockResolvedValueOnce({
      id: "wh_123",
      status: WebhookStatus.ACTIVE,
      consecutiveFailures: 1,
    });

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("endpoint 500"));

    await expect(invokeProcessWebhookCall(5)).rejects.toThrow("endpoint 500");
    expect(mockTxWebhookUpdate).toHaveBeenCalledTimes(1);
  });

  it("resets failure counter when re-enabling webhook", async () => {
    mockDb.webhook.findFirst.mockResolvedValue({
      id: "wh_123",
      teamId: 77,
      consecutiveFailures: 12,
      status: WebhookStatus.AUTO_DISABLED,
    });
    mockDb.webhook.update.mockResolvedValue({
      id: "wh_123",
      status: WebhookStatus.ACTIVE,
      consecutiveFailures: 0,
    });

    await WebhookService.setWebhookStatus({
      id: "wh_123",
      teamId: 77,
      status: WebhookStatus.ACTIVE,
    });

    expect(mockDb.webhook.update).toHaveBeenCalledWith({
      where: { id: "wh_123" },
      data: {
        status: WebhookStatus.ACTIVE,
        consecutiveFailures: 0,
      },
    });
  });

  it("creates webhook.test payload from dashboard test trigger", async () => {
    mockDb.webhook.findFirst.mockResolvedValue({
      id: "wh_123",
      teamId: 77,
    });
    mockDb.webhookCall.create.mockResolvedValue({
      id: "call_test_1",
    });

    await expect(
      WebhookService.testWebhook({
        webhookId: "wh_123",
        teamId: 77,
      }),
    ).resolves.toBe("call_test_1");

    expect(mockDb.webhookCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        webhookId: "wh_123",
        teamId: 77,
        type: "webhook.test",
        status: WebhookCallStatus.PENDING,
        attempt: 0,
      }),
    });

    const createInput = mockDb.webhookCall.create.mock.calls[0]![0] as {
      data: { payload: string };
    };
    const payload = JSON.parse(createInput.data.payload) as {
      sentAt: string;
      test: boolean;
      webhookId: string;
    };

    expect(payload).toMatchObject({
      test: true,
      webhookId: "wh_123",
    });
    expect(payload.sentAt).toBeTypeOf("string");
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "call_test_1",
      {
        callId: "call_test_1",
        teamId: 77,
      },
      { jobId: "call_test_1" },
    );
  });
});
