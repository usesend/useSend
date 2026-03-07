import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockWebhookService } = vi.hoisted(() => ({
  mockDb: {
    teamUser: {
      findFirst: vi.fn(),
    },
  },
  mockWebhookService: {
    listWebhooks: vi.fn(),
    getWebhook: vi.fn(),
    createWebhook: vi.fn(),
    updateWebhook: vi.fn(),
    setWebhookStatus: vi.fn(),
    deleteWebhook: vi.fn(),
    testWebhook: vi.fn(),
    listWebhookCalls: vi.fn(),
    getWebhookCall: vi.fn(),
    retryCall: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("~/server/service/webhook-service", () => ({
  WebhookService: mockWebhookService,
}));

import { createCallerFactory } from "~/server/api/trpc";
import { webhookRouter } from "~/server/api/routers/webhook";

const createCaller = createCallerFactory(webhookRouter);

function getContext() {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: {
        id: 42,
        email: "owner@example.com",
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      },
    },
  } as any;
}

describe("webhookRouter domain filters", () => {
  beforeEach(() => {
    mockDb.teamUser.findFirst.mockReset();
    mockWebhookService.createWebhook.mockReset();
    mockWebhookService.updateWebhook.mockReset();

    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 10,
      userId: 42,
      role: "ADMIN",
      team: { id: 10, name: "Acme" },
    });

    mockWebhookService.createWebhook.mockResolvedValue({
      id: "wh_1",
    });
    mockWebhookService.updateWebhook.mockResolvedValue({
      id: "wh_1",
    });
  });

  it("passes selected domainIds on webhook creation", async () => {
    const caller = createCaller(getContext());

    await caller.create({
      url: "https://example.com/webhook",
      eventTypes: ["email.sent"],
      domainIds: [1, 2, 3],
    });

    expect(mockWebhookService.createWebhook).toHaveBeenCalledWith({
      teamId: 10,
      userId: 42,
      url: "https://example.com/webhook",
      description: undefined,
      eventTypes: ["email.sent"],
      domainIds: [1, 2, 3],
      secret: undefined,
    });
  });

  it("passes selected domainIds on webhook update", async () => {
    const caller = createCaller(getContext());

    await caller.update({
      id: "wh_1",
      domainIds: [5, 6],
    });

    expect(mockWebhookService.updateWebhook).toHaveBeenCalledWith({
      id: "wh_1",
      teamId: 10,
      url: undefined,
      description: undefined,
      eventTypes: undefined,
      domainIds: [5, 6],
      rotateSecret: undefined,
      secret: undefined,
    });
  });
});
