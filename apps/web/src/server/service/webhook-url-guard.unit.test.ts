import { createServer, type Server } from "node:http";
import { WebhookStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  capturedProcessWebhookCall,
  mockDb,
  mockDnsLookup,
  mockLimitService,
  mockRedis,
} =
  vi.hoisted(() => ({
    capturedProcessWebhookCall: { handler: null as any },
    mockDb: {
      $transaction: vi.fn(),
      domain: { findMany: vi.fn() },
      webhook: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      webhookCall: { findUnique: vi.fn(), update: vi.fn() },
    },
    mockDnsLookup: vi.fn(),
    mockLimitService: { checkWebhookLimit: vi.fn() },
    mockRedis: { eval: vi.fn(), set: vi.fn() },
  }));

vi.mock("node:dns/promises", () => ({ lookup: mockDnsLookup }));

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

import {
  assertWebhookUrlAllowed,
  isNonPublicIpAddress,
  WebhookUrlNotAllowedError,
} from "~/server/service/webhook-url-guard";
import { WebhookService } from "~/server/service/webhook-service";

const publicAddress = { address: "93.184.216.34", family: 4 };

describe("isNonPublicIpAddress", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "2001:db8::1",
    "not-an-address",
  ])("treats %s as non-public", (address) => {
    expect(isNonPublicIpAddress(address)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "172.32.0.1",
    "2606:4700:10::6814:179a",
    "::ffff:93.184.216.34",
    "2001:4860:4860::8888",
  ])("treats %s as public", (address) => {
    expect(isNonPublicIpAddress(address)).toBe(false);
  });
});

describe("assertWebhookUrlAllowed", () => {
  beforeEach(() => {
    mockDnsLookup.mockReset();
    mockDnsLookup.mockResolvedValue([publicAddress]);
  });

  it("rejects a non-http scheme", async () => {
    await expect(assertWebhookUrlAllowed("file:///etc/passwd")).rejects.toThrow(
      WebhookUrlNotAllowedError,
    );
  });

  it("rejects an unparsable URL", async () => {
    await expect(assertWebhookUrlAllowed("not a url")).rejects.toThrow(
      WebhookUrlNotAllowedError,
    );
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://127.0.0.1:3000/admin",
    "http://10.0.0.5/hook",
    "http://[::1]:3000/hook",
    "http://[::ffff:169.254.169.254]/latest/meta-data/",
  ])("rejects the internal target %s", async (url) => {
    await expect(assertWebhookUrlAllowed(url)).rejects.toThrow(
      WebhookUrlNotAllowedError,
    );
    expect(mockDnsLookup).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves to a private address", async () => {
    mockDnsLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(
      assertWebhookUrlAllowed("https://hooks.internal.example.com/event"),
    ).rejects.toThrow(WebhookUrlNotAllowedError);
  });

  it("rejects a hostname when any resolved address is private", async () => {
    mockDnsLookup.mockResolvedValue([
      publicAddress,
      { address: "169.254.169.254", family: 4 },
    ]);

    await expect(
      assertWebhookUrlAllowed("https://hooks.example.com/event"),
    ).rejects.toThrow(WebhookUrlNotAllowedError);
  });

  it("allows a hostname that resolves to public addresses", async () => {
    await expect(
      assertWebhookUrlAllowed("https://hooks.example.com/event"),
    ).resolves.toBeUndefined();
  });

  it("allows a public address literal", async () => {
    await expect(
      assertWebhookUrlAllowed("https://93.184.216.34/hook"),
    ).resolves.toBeUndefined();
  });
});

describe("WebhookService URL validation", () => {
  beforeEach(() => {
    mockDnsLookup.mockReset();
    mockDnsLookup.mockResolvedValue([publicAddress]);
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

  beforeEach(async () => {
    mockDnsLookup.mockReset();
    mockDnsLookup.mockResolvedValue([publicAddress]);
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
    server = createServer((_request, response) => {
      received += 1;
      response.statusCode = 200;
      response.end("ok");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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

    await expect(invokeHandler()).rejects.toThrow(WebhookUrlNotAllowedError);

    expect(received).toBe(0);
    expect(mockDb.webhookCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining("publicly reachable host"),
        }),
      }),
    );
  });

  it("delivers to a public target", async () => {
    mockDb.webhookCall.findUnique.mockResolvedValue(
      buildCall("https://93.184.216.34/webhook"),
    );
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await invokeHandler();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://93.184.216.34/webhook");
  });
});
