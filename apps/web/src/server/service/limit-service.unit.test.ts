import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnv,
  mockGetTeamCached,
  mockTeamUsers,
  mockUsageAggregate,
  mockRedisEval,
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
  mockRedisEval: vi.fn(),
  mockRedisSet: vi.fn(),
  mockEmailTeam: vi.fn(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/db", () => ({
  db: {
    teamUser: { findMany: mockTeamUsers },
    dailyEmailUsage: { aggregate: mockUsageAggregate },
  },
}));
vi.mock("~/server/service/team-email", () => ({ emailTeam: mockEmailTeam }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
  getRedis: () => ({ set: mockRedisSet, eval: mockRedisEval }),
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
  const NOW = Date.parse("2026-12-20T12:00:00Z");
  const paid = (ageDays: number, overrides: Record<string, unknown> = {}) =>
    team({
      plan: "BASIC",
      name: "Acme",
      createdAt: new Date(NOW - ageDays * DAY - 60_000).toISOString(),
      ...overrides,
    });
  // A tiny in-memory stand-in for the Redis slot script.
  let slots: Map<string, Set<string>>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockGetTeamCached.mockReset();
    mockUsageAggregate.mockReset();
    mockEmailTeam.mockReset();
    mockRedisSet.mockReset();
    mockRedisSet.mockResolvedValue("OK");
    mockUsageAggregate.mockResolvedValue({
      _sum: { sent: 0, hardBounced: 0, complained: 0 },
    });
    slots = new Map();
    mockRedisEval.mockReset();
    mockRedisEval.mockImplementation(
      async (
        _script: string,
        _n: number,
        key: string,
        id: string,
        limit: string,
      ) => {
        const set = slots.get(key) ?? new Set<string>();
        slots.set(key, set);
        if (set.has(id)) return 1;
        if (set.size >= Number(limit)) return 0;
        set.add(id);
        return 1;
      },
    );
  });
  afterEach(() => vi.useRealTimers());

  it("lets a day-old paid team send 200 emails, then stops it and tells it once", async () => {
    mockGetTeamCached.mockResolvedValue(paid(0));
    for (let i = 0; i < 200; i++) {
      await expect(
        LimitService.checkEmailLimit(1, [], `e${i}`),
      ).resolves.toMatchObject({
        isLimitReached: false,
      });
    }
    // A retry of an email that already has a slot still goes.
    await expect(
      LimitService.checkEmailLimit(1, [], "e5"),
    ).resolves.toMatchObject({
      isLimitReached: false,
    });
    await expect(
      LimitService.checkEmailLimit(1, [], "e200"),
    ).resolves.toMatchObject({
      isLimitReached: true,
      limit: 200,
      reason: LimitReason.EMAIL_DAILY_LIMIT_REACHED,
    });
    await vi.waitFor(() =>
      expect(mockEmailTeam).toHaveBeenCalledWith(
        1,
        expect.stringContaining("limit for new accounts"),
        expect.stringContaining("200"),
      ),
    );

    mockRedisSet.mockResolvedValue(null); // already told today
    await LimitService.checkEmailLimit(1, [], "e201");
    await Promise.resolve();
    expect(mockEmailTeam).toHaveBeenCalledTimes(1);
  });

  it("keeps sending if the check itself fails", async () => {
    mockGetTeamCached.mockResolvedValue(paid(0));
    mockRedisEval.mockRejectedValue(new Error("redis down"));
    await expect(
      LimitService.checkEmailLimit(1, [], "e1"),
    ).resolves.toMatchObject({
      isLimitReached: false,
    });
  });

  it("never touches established customers, grandfathered teams or custom limits", async () => {
    const before = team({
      plan: "BASIC",
      createdAt: "2026-11-27T10:00:00Z",
    });
    for (const t of [
      paid(14),
      paid(300),
      paid(0, { dailyEmailLimit: 50_000 }),
      before,
    ]) {
      mockGetTeamCached.mockResolvedValue(t);
      await expect(
        LimitService.checkEmailLimit(1, [], "e1"),
      ).resolves.toMatchObject({
        isLimitReached: false,
      });
    }
    expect(mockUsageAggregate).not.toHaveBeenCalled();
    expect(mockRedisEval).not.toHaveBeenCalled();
  });
});
