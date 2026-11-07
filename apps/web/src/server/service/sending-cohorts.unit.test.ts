import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockDb, redisStore, mockRedisSet } = vi.hoisted(() => {
  const redisStore = new Set<string>();
  return {
    mockEnv: { NEXT_PUBLIC_IS_CLOUD: true },
    mockDb: {
      sendingCohort: { upsert: vi.fn(), findFirst: vi.fn() },
    },
    redisStore,
    mockRedisSet: vi.fn(async (key: string) => {
      if (redisStore.has(key)) return null;
      redisStore.add(key);
      return "OK";
    }),
  };
});

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/redis", () => ({
  redisKey: (key: string) => key,
  getRedis: () => ({ set: mockRedisSet }),
}));

import {
  claimOutcome,
  recordOutcome,
  recordSend,
  resetTrackingStartCache,
} from "~/server/service/sending-cohorts";

describe("sending cohorts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    resetTrackingStartCache();
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockDb.sendingCohort.findFirst.mockResolvedValue({
      createdAt: new Date("2026-11-08T00:00:00Z"),
    });
  });

  it("counts a send under today's date", async () => {
    await recordSend(3, new Date("2026-11-09T10:00:00Z"));

    expect(mockDb.sendingCohort.upsert).toHaveBeenCalledWith({
      where: { teamId_date: { teamId: 3, date: "2026-11-09" } },
      create: { teamId: 3, date: "2026-11-09", sent: 1 },
      update: { sent: { increment: 1 } },
    });
  });

  it("never fails a send because counting failed", async () => {
    mockDb.sendingCohort.upsert.mockRejectedValue(new Error("db down"));

    await expect(recordSend(3)).resolves.toBeUndefined();
  });

  it("files a complaint under the day its email was sent", async () => {
    await expect(
      recordOutcome(3, new Date("2026-11-09T23:59:00Z"), "complained"),
    ).resolves.toBe(true);

    expect(mockDb.sendingCohort.upsert).toHaveBeenCalledWith({
      where: { teamId_date: { teamId: 3, date: "2026-11-09" } },
      create: { teamId: 3, date: "2026-11-09", complained: 1 },
      update: { complained: { increment: 1 } },
    });
  });

  it("skips emails sent before send counting began", async () => {
    await expect(
      recordOutcome(3, new Date("2026-11-07T12:00:00Z"), "hardBounced"),
    ).resolves.toBe(false);

    mockDb.sendingCohort.findFirst.mockResolvedValue(null);
    resetTrackingStartCache();
    await expect(
      recordOutcome(3, new Date("2026-11-09T12:00:00Z"), "hardBounced"),
    ).resolves.toBe(false);

    expect(mockDb.sendingCohort.upsert).not.toHaveBeenCalled();
  });

  it("claims each outcome once per email", async () => {
    await expect(claimOutcome("email_1", "complained")).resolves.toBe(true);
    await expect(claimOutcome("email_1", "complained")).resolves.toBe(false);
    await expect(claimOutcome("email_1", "hardBounced")).resolves.toBe(true);
  });

  it("counts the event if Redis is unavailable", async () => {
    mockRedisSet.mockRejectedValueOnce(new Error("redis down"));

    await expect(claimOutcome("email_2", "complained")).resolves.toBe(true);
  });

  it("does nothing on self-hosted", async () => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;

    await recordSend(3);
    await recordOutcome(3, new Date(), "complained");

    expect(mockDb.sendingCohort.upsert).not.toHaveBeenCalled();
  });
});
