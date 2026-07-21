import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
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
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
    info: mocks.loggerInfo,
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
    mocks.loggerDebug.mockReset();
    mocks.loggerError.mockReset();
    mocks.loggerInfo.mockReset();
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

  it("reports rejected campaign enqueues in the scheduler summary", async () => {
    const enqueueError = new Error("Redis unavailable");
    mocks.findMany.mockResolvedValue([
      {
        id: "campaign_1",
        teamId: 7,
        lastSentAt: null,
        batchWindowMinutes: 0,
      },
      {
        id: "campaign_2",
        teamId: 8,
        lastSentAt: null,
        batchWindowMinutes: 0,
      },
    ]);
    mocks.queueBatch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(enqueueError);

    await runCampaignSchedulerTick();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: enqueueError, campaignId: "campaign_2" },
      "Failed to enqueue campaign batch",
    );
    expect(mocks.loggerDebug).toHaveBeenCalledWith(
      { total: 2, fulfilled: 1, rejected: 1 },
      "Scheduler enqueue summary",
    );
  });
});
