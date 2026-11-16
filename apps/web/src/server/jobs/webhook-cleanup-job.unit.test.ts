import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    webhookCall: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/redis", () => ({
  getRedis: vi.fn(() => ({})),
  BULL_PREFIX: "test",
}));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("bullmq", () => ({
  Queue: class {
    upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
  },
  Worker: class {
    on = vi.fn();
  },
}));

import { deleteOldWebhookCalls } from "~/server/jobs/webhook-cleanup-job";

const ids = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: `call_${from + i}` }));

describe("deleteOldWebhookCalls", () => {
  const cutoff = new Date("2026-10-17T00:00:00Z");

  beforeEach(() => {
    mockDb.webhookCall.deleteMany.mockImplementation(
      async ({ where }: any) => ({
        count: where.id.in.length,
      }),
    );
  });

  it("deletes old calls in batches until none are left", async () => {
    mockDb.webhookCall.findMany
      .mockResolvedValueOnce(ids(3, 0))
      .mockResolvedValueOnce(ids(3, 3))
      .mockResolvedValueOnce(ids(1, 6));

    const result = await deleteOldWebhookCalls({
      cutoff,
      batchSize: 3,
      pauseMs: 0,
    });

    expect(result).toEqual({ deleted: 7, batches: 3, finished: true });
    // Only calls older than the cutoff, oldest first, one batch at a time.
    expect(mockDb.webhookCall.findMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 3,
    });
    // Each DELETE is limited to the ids of its batch.
    expect(mockDb.webhookCall.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["call_0", "call_1", "call_2"] } },
    });
    expect(mockDb.webhookCall.deleteMany).toHaveBeenCalledTimes(3);
  });

  it("does nothing when there is nothing old enough", async () => {
    mockDb.webhookCall.findMany.mockResolvedValue([]);

    const result = await deleteOldWebhookCalls({ cutoff, pauseMs: 0 });

    expect(result).toEqual({ deleted: 0, batches: 0, finished: true });
    expect(mockDb.webhookCall.deleteMany).not.toHaveBeenCalled();
  });

  it("stops at the time limit and leaves the rest for the next run", async () => {
    mockDb.webhookCall.findMany.mockImplementation(async () => ids(2));
    let clock = 0;
    const now = () => {
      clock += 400;
      return clock;
    };

    const result = await deleteOldWebhookCalls({
      cutoff,
      batchSize: 2,
      pauseMs: 0,
      maxRunMs: 1000,
      now,
    });

    expect(result.finished).toBe(false);
    expect(result.batches).toBeLessThanOrEqual(3);
    expect(result.deleted).toBe(result.batches * 2);
  });
});
