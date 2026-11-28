import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnv,
  mockGetTeamCached,
  mockTeamUsers,
  mockUsageAggregate,
  mockEmailCount,
  mockRedisSet,
  mockEmailTeam,
} = vi.hoisted(() => ({
  mockEnv: {
    NEXT_PUBLIC_IS_CLOUD: true,
    NEXTAUTH_URL: "https://app.usesend.com",
  },
  mockGetTeamCached: vi.fn(),
  mockTeamUsers: vi.fn(),
  mockUsageAggregate: vi.fn(),
  mockEmailCount: vi.fn(),
  mockRedisSet: vi.fn(),
  mockEmailTeam: vi.fn(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/db", () => ({
  db: {
    teamUser: { findMany: mockTeamUsers },
    dailyEmailUsage: { aggregate: mockUsageAggregate },
    email: { count: mockEmailCount },
  },
}));
vi.mock("~/server/service/team-email", () => ({ emailTeam: mockEmailTeam }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
  getRedis: () => ({ set: mockRedisSet }),
  redisKey: (key: string) => key,
}));
vi.mock("~/server/service/usage-service", () => ({
  getThisMonthUsage: vi.fn(async () => ({
    day: [{ sent: 1 }],
    month: [{ sent: 1 }],
  })),
}));
vi.mock("~/server/service/team-service", () => ({
  TeamService: {
    getTeamCached: mockGetTeamCached,
    maybeNotifyEmailLimitReached: vi.fn(),
    sendWarningEmail: vi.fn(),
  },
}));

import { LimitReason } from "~/lib/constants/plans";
import { LimitService } from "~/server/service/limit-service";

function team(overrides: Record<string, unknown>) {
  return {
    id: 1,
    plan: "FREE",
    isActive: true,
    isBlocked: false,
    freePlanAllowed: false,
    dailyEmailLimit: 10_000,
    ...overrides,
  };
}

describe("LimitService.checkEmailLimit paid-only signups", () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockGetTeamCached.mockReset();
    mockTeamUsers.mockResolvedValue([
      { user: { email: "Sam@acme.com" } },
      { user: { email: "lee@acme.com" } },
    ]);
  });

  it("lets a new team send test emails to its own members", async () => {
    mockGetTeamCached.mockResolvedValue(team({}));

    await expect(
      LimitService.checkEmailLimit(1, ["sam@acme.com", "LEE@acme.com"]),
    ).resolves.toMatchObject({ isLimitReached: false });
  });

  it("still stops a new team emailing anyone else", async () => {
    mockGetTeamCached.mockResolvedValue(team({}));

    await expect(
      LimitService.checkEmailLimit(1, ["sam@acme.com", "someone@else.com"]),
    ).resolves.toMatchObject({ reason: LimitReason.EMAIL_PLAN_REQUIRED });
  });

  it("stops a new team on the free plan from sending", async () => {
    mockGetTeamCached.mockResolvedValue(team({}));

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: true,
      reason: LimitReason.EMAIL_PLAN_REQUIRED,
    });
  });

  it("stops a new team whose paid plan lapsed", async () => {
    mockGetTeamCached.mockResolvedValue(
      team({ plan: "BASIC", isActive: false }),
    );

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      reason: LimitReason.EMAIL_PLAN_REQUIRED,
    });
  });

  it("lets a new team on a paid plan send", async () => {
    mockGetTeamCached.mockResolvedValue(team({ plan: "BASIC" }));

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: false,
    });
  });

  it("lets existing free teams keep sending", async () => {
    mockGetTeamCached.mockResolvedValue(team({ freePlanAllowed: true }));

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: false,
    });
  });

  it("doesn't stop a team cached before the field existed", async () => {
    const cached = team({});
    delete (cached as Record<string, unknown>).freePlanAllowed;
    mockGetTeamCached.mockResolvedValue(cached);

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: false,
    });
  });

  it("stops a paused team from sending", async () => {
    mockGetTeamCached.mockResolvedValue(
      team({
        freePlanAllowed: true,
        sendingPausedAt: new Date().toISOString(),
      }),
    );

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: true,
      reason: LimitReason.EMAIL_SENDING_PAUSED,
    });
  });

  it("reports a block before the missing plan", async () => {
    mockGetTeamCached.mockResolvedValue(team({ isBlocked: true }));

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      reason: LimitReason.EMAIL_BLOCKED,
    });
  });

  it("never applies on self-hosted", async () => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: false,
    });
    expect(mockGetTeamCached).not.toHaveBeenCalled();
  });
});

describe("LimitService.checkEmailLimit new-account limit", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const paid = (ageDays: number, overrides: Record<string, unknown> = {}) =>
    team({
      plan: "BASIC",
      name: "Acme",
      createdAt: new Date(Date.now() - ageDays * DAY - 60_000).toISOString(),
      ...overrides,
    });

  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockGetTeamCached.mockReset();
    mockUsageAggregate.mockReset();
    mockEmailCount.mockReset();
    mockEmailTeam.mockReset();
    mockRedisSet.mockReset();
    mockRedisSet.mockResolvedValue("OK");
    mockUsageAggregate.mockResolvedValue({
      _sum: { sent: 0, hardBounced: 0, complained: 0 },
    });
  });

  it("stops a day-old paid team at 200 emails and tells it once", async () => {
    mockGetTeamCached.mockResolvedValue(paid(0));
    mockEmailCount.mockResolvedValue(200);

    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: true,
      limit: 200,
      reason: LimitReason.EMAIL_DAILY_LIMIT_REACHED,
    });
    expect(mockEmailTeam).toHaveBeenCalledWith(
      1,
      expect.stringContaining("limit for new accounts"),
      expect.stringContaining("200"),
    );

    mockRedisSet.mockResolvedValue(null); // already told today
    await LimitService.checkEmailLimit(1);
    expect(mockEmailTeam).toHaveBeenCalledTimes(1);
  });

  it("lets a new team send under its limit", async () => {
    mockGetTeamCached.mockResolvedValue(paid(4));
    mockEmailCount.mockResolvedValue(999);
    await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
      isLimitReached: false,
    });
  });

  it("never touches established customers or custom limits", async () => {
    for (const t of [
      paid(14),
      paid(300),
      paid(0, { dailyEmailLimit: 50_000 }),
    ]) {
      mockGetTeamCached.mockResolvedValue(t);
      await expect(LimitService.checkEmailLimit(1)).resolves.toMatchObject({
        isLimitReached: false,
      });
    }
    expect(mockUsageAggregate).not.toHaveBeenCalled();
    expect(mockEmailCount).not.toHaveBeenCalled();
  });
});
