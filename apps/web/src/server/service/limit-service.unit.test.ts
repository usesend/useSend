import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockGetTeamCached } = vi.hoisted(() => ({
  mockEnv: { NEXT_PUBLIC_IS_CLOUD: true },
  mockGetTeamCached: vi.fn(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
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
