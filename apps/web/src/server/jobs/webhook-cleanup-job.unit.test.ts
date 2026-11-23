import { WebhookCallStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTx, mockDb } = vi.hoisted(() => {
  const mockTx = {
    $executeRawUnsafe: vi.fn(),
    webhookCall: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    mockTx,
    mockDb: {
      $transaction: vi.fn(),
    },
  };
});

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
  const oldAndFinished = {
    createdAt: { lt: cutoff },
    updatedAt: { lt: cutoff },
    status: {
      in: [
        WebhookCallStatus.DELIVERED,
        WebhookCallStatus.FAILED,
        WebhookCallStatus.DISCARDED,
      ],
    },
  };

  beforeEach(() => {
    mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.$executeRawUnsafe.mockResolvedValue(0);
    mockTx.webhookCall.deleteMany.mockImplementation(
      async ({ where }: any) => ({
        count: where.id.in.length,
      }),
    );
  });

  it("deletes old, finished calls in batches until none are left", async () => {
    mockTx.webhookCall.findMany
      .mockResolvedValueOnce(ids(3, 0))
      .mockResolvedValueOnce(ids(3, 3))
      .mockResolvedValueOnce(ids(1, 6));

    const result = await deleteOldWebhookCalls({
      cutoff,
      batchSize: 3,
      pauseMs: 0,
    });

    expect(result).toMatchObject({ deleted: 7, batches: 3, finished: true });
    // Only finished calls created and last updated before the cutoff.
    expect(mockTx.webhookCall.findMany).toHaveBeenCalledWith({
      where: oldAndFinished,
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 3,
    });
    // The DELETE repeats those conditions, so a call retried in between is kept.
    expect(mockTx.webhookCall.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["call_0", "call_1", "call_2"] }, ...oldAndFinished },
    });
    // Each batch runs in its own transaction with lock and statement timeouts,
    // and Prisma's transaction limit set above them (its default is 5s).
    expect(mockDb.$transaction).toHaveBeenCalledTimes(3);
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 130_000,
      maxWait: 2_000,
    });
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL lock_timeout = '5s'",
    );
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL statement_timeout = '60s'",
    );
  });

  it("does nothing when there is nothing old enough", async () => {
    mockTx.webhookCall.findMany.mockResolvedValue([]);

    const result = await deleteOldWebhookCalls({ cutoff, pauseMs: 0 });

    expect(result).toMatchObject({ deleted: 0, batches: 0, finished: true });
    expect(mockTx.webhookCall.deleteMany).not.toHaveBeenCalled();
  });

  it("counts only the calls actually deleted", async () => {
    // Two of the three selected calls were retried before the DELETE ran.
    mockTx.webhookCall.findMany.mockResolvedValueOnce(ids(3));
    mockTx.webhookCall.deleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await deleteOldWebhookCalls({
      cutoff,
      batchSize: 5,
      pauseMs: 0,
    });

    expect(result).toMatchObject({ deleted: 1, batches: 1, finished: true });
  });

  it("doesn't start a batch after the time limit, and leaves the rest for the next run", async () => {
    mockTx.webhookCall.findMany.mockImplementation(async () => ids(2));
    let clock = 0;
    const now = () => clock;
    mockTx.webhookCall.deleteMany.mockImplementation(async ({ where }: any) => {
      clock += 400; // each batch takes 400ms
      return { count: where.id.in.length };
    });

    const result = await deleteOldWebhookCalls({
      cutoff,
      batchSize: 2,
      pauseMs: 0,
      maxRunMs: 1000,
      now,
    });

    // Batches start at 0, 400 and 800ms; at 1200ms the limit has passed.
    expect(result).toMatchObject({ deleted: 6, batches: 3, finished: false });
  });

  it("stops the run when a batch fails, keeping what was already deleted", async () => {
    mockTx.webhookCall.findMany
      .mockResolvedValueOnce(ids(2))
      .mockRejectedValueOnce(
        new Error("canceling statement due to lock timeout"),
      );

    await expect(
      deleteOldWebhookCalls({ cutoff, batchSize: 2, pauseMs: 0 }),
    ).rejects.toThrow("lock timeout");
    expect(mockTx.webhookCall.deleteMany).toHaveBeenCalledTimes(1);
  });
});
