import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  queueBatch: vi.fn(),
  queueAdd: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = mocks.queueAdd;
  },
  Worker: class {},
}));

vi.mock("~/server/queue/bullmq-context", () => ({
  createWorkerHandler: vi.fn((handler) => handler),
}));

vi.mock("~/server/db", () => ({
  db: {
    campaign: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("~/server/redis", () => ({
  BULL_PREFIX: "bull",
  getRedis: vi.fn(() => ({})),
}));

vi.mock("~/server/logger/log", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("~/server/service/campaign-service", () => ({
  CampaignBatchService: {
    queueBatch: mocks.queueBatch,
  },
}));

import { runCampaignSchedulerTick } from "~/server/jobs/campaign-scheduler-job";

describe("campaign scheduler", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.queueBatch.mockReset();
    mocks.queueAdd.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T09:00:00.000Z"));
    mocks.findMany.mockResolvedValue([]);
  });

  it("selects only campaigns whose schedule or gradual wave is due", async () => {
    await runCampaignSchedulerTick();

    const now = new Date("2026-07-21T09:00:00.000Z");
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["SCHEDULED", "RUNNING"] },
        AND: [
          {
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
          },
          {
            OR: [
              { deliveryMode: "ALL_AT_ONCE" },
              { nextDeliveryAt: null },
              { nextDeliveryAt: { lte: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        teamId: true,
        lastSentAt: true,
        batchWindowMinutes: true,
      },
    });
  });

  it("queues campaigns returned by the due-work query", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "campaign_1",
        teamId: 7,
        lastSentAt: null,
        batchWindowMinutes: 0,
      },
    ]);
    mocks.queueBatch.mockResolvedValue(undefined);

    await runCampaignSchedulerTick();

    expect(mocks.queueBatch).toHaveBeenCalledWith({
      campaignId: "campaign_1",
      teamId: 7,
    });
  });
});
