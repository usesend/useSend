import { createServer, type Server } from "node:http";
import { WebhookStatus } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  capturedProcessWebhookCall,
  mockDb,
  mockDnsLookup,
  mockEnv,
  mockLimitService,
  mockRedis,
} = vi.hoisted(() => ({
  capturedProcessWebhookCall: { handler: null as any },
  mockDb: {
    $transaction: vi.fn(),
    domain: { findMany: vi.fn() },
    webhook: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    webhookCall: { findUnique: vi.fn(), update: vi.fn() },
  },
  mockDnsLookup: vi.fn(),
  mockEnv: { WEBHOOK_ALLOW_PRIVATE_URLS: false },
  mockLimitService: { checkWebhookLimit: vi.fn() },
  mockRedis: { eval: vi.fn(), set: vi.fn() },
}));

vi.mock("node:dns", () => ({ lookup: mockDnsLookup }));

vi.mock("~/env", () => ({ env: mockEnv }));

vi.mock("bullmq", () => ({
  Queue: class {
    public add = vi.fn();
  },
  Worker: class {
    public on = vi.fn();
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));

vi.mock("~/server/logger/log", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("~/server/service/limit-service", () => ({
  LimitService: mockLimitService,
}));

vi.mock("~/server/queue/bullmq-context", () => ({
  createWorkerHandler: (handler: any) => {
    capturedProcessWebhookCall.handler = handler;
    return handler;
  },
}));

vi.mock("~/server/redis", () => ({
  BULL_PREFIX: "bull",
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

import { OutboundUrlNotAllowedError } from "~/server/utils/outbound-url-guard";
import { WebhookService } from "~/server/service/webhook-service";

function resolveTo(address: string) {
  mockDnsLookup.mockImplementation(
    (_hostname: string, _options: unknown, callback: Function) =>
      callback(null, [{ address, family: 4 }]),
  );
}

beforeEach(() => {
  mockEnv.WEBHOOK_ALLOW_PRIVATE_URLS = false;
  resolveTo("93.184.216.34");
});

describe("WebhookService URL validation", () => {
  beforeEach(() => {
    mockDb.webhook.create.mockReset();
    mockDb.webhook.findFirst.mockReset();
    mockDb.webhook.update.mockReset();
    mockLimitService.checkWebhookLimit.mockReset();
    mockLimitService.checkWebhookLimit.mockResolvedValue({
      isLimitReached: false,
      reason: null,
    });
  });

  it("rejects create with an internal URL and writes nothing", async () => {
    await expect(
      WebhookService.createWebhook({
        teamId: 77,
        userId: 5,
        url: "http://169.254.169.254/latest/meta-data/",
        eventTypes: ["email.delivered"],
      }),
    ).rejects.toThrow(/publicly reachable host/);

    expect(mockDb.webhook.create).not.toHaveBeenCalled();
  });

  it("rejects update with an internal URL and writes nothing", async () => {
    mockDb.webhook.findFirst.mockResolvedValue({
      id: "wh_123",
      teamId: 77,
      url: "https://hooks.example.com/event",
      description: null,
      eventTypes: ["email.delivered"],
      domainIds: [],
      secret: "whsec_test",
    });

    await expect(
      WebhookService.updateWebhook({
        id: "wh_123",
        teamId: 77,
        url: "http://127.0.0.1:3000/hook",
      }),
    ).rejects.toThrow(/publicly reachable host/);

    expect(mockDb.webhook.update).not.toHaveBeenCalled();
  });

  it("rejects create with a hostname that resolves to a private address", async () => {
    resolveTo("172.18.0.4");

    await expect(
      WebhookService.createWebhook({
        teamId: 77,
        userId: 5,
        url: "http://n8n:5678/webhook",
        eventTypes: ["email.delivered"],
      }),
    ).rejects.toThrow(/publicly reachable host/);

    expect(mockDb.webhook.create).not.toHaveBeenCalled();
  });

  it("accepts create when the host cannot be resolved", async () => {
    mockDnsLookup.mockImplementation(
      (_hostname: string, _options: unknown, callback: Function) =>
        callback(Object.assign(new Error("EAI_AGAIN"), { code: "EAI_AGAIN" })),
    );
    mockDb.webhook.create.mockResolvedValue({ id: "wh_new" });

    await expect(
      WebhookService.createWebhook({
        teamId: 77,
        userId: 5,
        url: "https://hooks.example.com/event",
        eventTypes: ["email.delivered"],
      }),
    ).resolves.toMatchObject({ id: "wh_new" });
  });

  it("accepts create with an internal URL when private addresses are allowed", async () => {
    mockEnv.WEBHOOK_ALLOW_PRIVATE_URLS = true;
    resolveTo("172.18.0.4");
    mockDb.webhook.create.mockResolvedValue({ id: "wh_new" });

    await expect(
      WebhookService.createWebhook({
        teamId: 77,
        userId: 5,
        url: "http://n8n:5678/webhook",
        eventTypes: ["email.delivered"],
      }),
    ).resolves.toMatchObject({ id: "wh_new" });
  });

  it("accepts create with a public URL", async () => {
    mockDb.webhook.create.mockResolvedValue({ id: "wh_new" });

    await expect(
      WebhookService.createWebhook({
        teamId: 77,
        userId: 5,
        url: "https://hooks.example.com/event",
        eventTypes: ["email.delivered"],
      }),
    ).resolves.toMatchObject({ id: "wh_new" });
  });
});

describe("webhook delivery guard", () => {
  let server: Server;
  let port = 0;
  let received = 0;

  beforeAll(async () => {
    server = createServer((_request, response) => {
      received += 1;
      response.statusCode = 200;
      response.setHeader("content-type", "text/plain");
      response.end("ok");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    mockDb.$transaction.mockReset();
    mockDb.webhook.update.mockReset();
    mockDb.webhookCall.findUnique.mockReset();
    mockDb.webhookCall.update.mockReset();
    mockRedis.set.mockReset();
    mockRedis.eval.mockReset();

    mockDb.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") {
        return (input as any)({ webhook: { update: mockDb.webhook.update } });
      }
      return Promise.all(input as Array<Promise<unknown>>);
    });
    mockDb.webhookCall.update.mockResolvedValue({});
    mockDb.webhook.update.mockResolvedValue({
      id: "wh_123",
      status: WebhookStatus.ACTIVE,
      consecutiveFailures: 0,
    });
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.eval.mockResolvedValue(1);

    received = 0;
  });

  function buildCall(url: string) {
    return {
      id: "call_123",
      webhookId: "wh_123",
      teamId: 77,
      type: "email.delivered",
      payload: JSON.stringify({ id: "email_123" }),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      webhook: {
        id: "wh_123",
        url,
        secret: "whsec_test",
        apiVersion: null,
        status: WebhookStatus.ACTIVE,
        consecutiveFailures: 0,
      },
    };
  }

  function invokeHandler() {
    if (!capturedProcessWebhookCall.handler) {
      throw new Error("processWebhookCall handler not captured");
    }

    return capturedProcessWebhookCall.handler({
      attemptsMade: 0,
      data: { callId: "call_123", teamId: 77 },
    });
  }

  it("does not contact a loopback webhook target", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(
      buildCall(`http://127.0.0.1:${port}/internal`),
    );

    await expect(invokeHandler()).rejects.toThrow(OutboundUrlNotAllowedError);

    expect(received).toBe(0);
    expect(mockDb.webhookCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining("publicly reachable host"),
        }),
      }),
    );
  });

  it("does not contact a hostname that resolves to loopback", async () => {
    resolveTo("127.0.0.1");
    mockDb.webhookCall.findUnique.mockResolvedValue(
      buildCall(`http://hooks.example.com:${port}/internal`),
    );

    await expect(invokeHandler()).rejects.toThrow(OutboundUrlNotAllowedError);

    expect(received).toBe(0);
  });

  it("counts a hanging DNS lookup against the request timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      mockDnsLookup.mockImplementation(() => undefined);
      mockDb.webhookCall.findUnique.mockResolvedValue(
        buildCall(`http://hooks.example.com:${port}/internal`),
      );

      const result = invokeHandler().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(result).resolves.toMatchObject({
        message: "Webhook request timed out",
      });
      expect(received).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers to an internal target when private addresses are allowed", async () => {
    mockEnv.WEBHOOK_ALLOW_PRIVATE_URLS = true;
    mockDb.webhookCall.findUnique.mockResolvedValue(
      buildCall(`http://127.0.0.1:${port}/internal`),
    );

    await expect(invokeHandler()).resolves.toBeUndefined();

    expect(received).toBe(1);
    expect(mockDb.webhookCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseStatus: 200,
          responseText: "ok",
        }),
      }),
    );
  });
});
