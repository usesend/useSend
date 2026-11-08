import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockDb, redisStore, mockRedisSet } = vi.hoisted(() => {
  const redisStore = new Set<string>();
  return {
    mockEnv: { NEXT_PUBLIC_IS_CLOUD: true },
    mockDb: {
      $transaction: vi.fn(),
      sendingCohort: {
        upsert: vi.fn((args: unknown) => ({ op: "cohort", args })),
      },
      campaign: {
        update: vi.fn((args: unknown) => ({ op: "campaign", args })),
        updateMany: vi.fn((args: unknown) => ({
          op: "campaignOutcome",
          args,
        })),
      },
      email: { update: vi.fn((args: unknown) => ({ op: "email", args })) },
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
  saveSentEmail,
} from "~/server/service/sending-cohorts";

const sent = { sesEmailId: "ses_1", text: "hi", headers: null };

describe("sending cohorts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockDb.$transaction.mockResolvedValue([]);
  });

  afterEach(() => {});

  function freezeDate() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T10:00:00Z"));
  }

  it("counts the send and marks the email in one transaction", async () => {
    freezeDate();
    await saveSentEmail({ id: "e1", teamId: 3, campaignId: "c1" }, sent);

    const ops = mockDb.$transaction.mock.calls[0]?.[0];
    expect(ops.map((op: { op: string }) => op.op)).toEqual([
      "cohort",
      "campaign",
      "email",
    ]);
    expect(mockDb.sendingCohort.upsert).toHaveBeenCalledWith({
      where: { teamId_date: { teamId: 3, date: "2026-11-09" } },
      create: { teamId: 3, date: "2026-11-09", sent: 1 },
      update: { sent: { increment: 1 } },
    });
    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { acceptedSends: { increment: 1 } },
    });
    expect(mockDb.email.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { ...sent, cohortDate: "2026-11-09" },
    });
  });

  it("still saves the email, unmarked, if counting fails", async () => {
    freezeDate();
    mockDb.$transaction.mockRejectedValue(new Error("db busy"));

    await saveSentEmail({ id: "e1", teamId: 3, campaignId: null }, sent);

    expect(mockDb.email.update).toHaveBeenLastCalledWith({
      where: { id: "e1" },
      data: sent,
    });
  });

  it("files an outcome under the day its email was counted", async () => {
    await expect(
      recordOutcome(
        { teamId: 3, campaignId: "c1", cohortDate: "2026-11-09" },
        "complained",
      ),
    ).resolves.toBe(true);

    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { acceptedComplained: { increment: 1 } },
    });

    expect(mockDb.sendingCohort.upsert).toHaveBeenCalledWith({
      where: { teamId_date: { teamId: 3, date: "2026-11-09" } },
      create: { teamId: 3, date: "2026-11-09", complained: 1 },
      update: { complained: { increment: 1 } },
    });
  });

  it("skips outcomes of emails whose send wasn't counted", async () => {
    await expect(
      recordOutcome(
        { teamId: 3, campaignId: null, cohortDate: null },
        "hardBounced",
      ),
    ).resolves.toBe(false);

    expect(mockDb.sendingCohort.upsert).not.toHaveBeenCalled();
  });

  it("claims each outcome once per email", async () => {
    await expect(claimOutcome("email_1", "complained")).resolves.toBe(
      "claimed",
    );
    await expect(claimOutcome("email_1", "complained")).resolves.toBe(
      "duplicate",
    );
    await expect(claimOutcome("email_1", "hardBounced")).resolves.toBe(
      "claimed",
    );
  });

  it("reports when Redis can't check for duplicates", async () => {
    mockRedisSet.mockRejectedValueOnce(new Error("redis down"));

    await expect(claimOutcome("email_2", "complained")).resolves.toBe(
      "unavailable",
    );
  });

  it("only saves the email on self-hosted", async () => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;

    await saveSentEmail({ id: "e1", teamId: 3, campaignId: null }, sent);
    await recordOutcome(
      { teamId: 3, campaignId: null, cohortDate: "2026-11-09" },
      "complained",
    );

    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.sendingCohort.upsert).not.toHaveBeenCalled();
    expect(mockDb.email.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: sent,
    });
  });
});
