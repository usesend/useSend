import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockDb, mockTx, mockGetTeamCached } = vi.hoisted(() => ({
  mockEnv: {
    NEXT_PUBLIC_IS_CLOUD: true,
  },
  mockDb: {
    contactBook: {
      count: vi.fn(),
    },
  },
  mockTx: {
    $executeRaw: vi.fn(),
    contactBook: {
      count: vi.fn(),
    },
    team: {
      findUnique: vi.fn(),
    },
  },
  mockGetTeamCached: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: mockEnv,
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/redis", () => ({
  withCache: vi.fn(),
}));

vi.mock("~/server/service/usage-service", () => ({
  getThisMonthUsage: vi.fn(),
}));

vi.mock("~/server/service/team-service", () => ({
  TeamService: {
    getTeamCached: mockGetTeamCached,
  },
}));

import { LimitService } from "~/server/service/limit-service";

describe("LimitService plan-limit locking", () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockGetTeamCached.mockResolvedValue({ plan: "FREE", isActive: true });
    mockTx.team.findUnique.mockResolvedValue({ plan: "FREE", isActive: true });
  });

  it("takes a per-team transaction advisory lock for the resource", async () => {
    await LimitService.lockPlanLimit(mockTx as any, 12, "contactBook");

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockTx.$executeRaw.mock.calls[0]!;
    expect(strings.join("?")).toContain("pg_advisory_xact_lock(");
    expect(values).toEqual([1431520592, 12]);
  });

  it("uses a different lock namespace per resource", async () => {
    await LimitService.lockPlanLimit(mockTx as any, 12, "domain");
    await LimitService.lockPlanLimit(mockTx as any, 12, "teamMember");
    await LimitService.lockPlanLimit(mockTx as any, 12, "webhook");

    const namespaces = mockTx.$executeRaw.mock.calls.map((call) => call[1]);
    expect(new Set(namespaces).size).toBe(3);
  });

  it("does not lock when limits are disabled in self-hosted mode", async () => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;

    await LimitService.lockPlanLimit(mockTx as any, 12, "contactBook");

    expect(mockTx.$executeRaw).not.toHaveBeenCalled();
  });

  it("counts existing resources through the provided transaction client", async () => {
    mockTx.contactBook.count.mockResolvedValue(1);

    await expect(
      LimitService.checkContactBookLimit(12, mockTx as any),
    ).resolves.toMatchObject({ isLimitReached: true, limit: 1 });

    expect(mockTx.contactBook.count).toHaveBeenCalledWith({
      where: { teamId: 12 },
    });
    expect(mockDb.contactBook.count).not.toHaveBeenCalled();
  });

  it("reads the team through the transaction client instead of the cache", async () => {
    mockTx.contactBook.count.mockResolvedValue(0);

    await LimitService.checkContactBookLimit(12, mockTx as any);

    expect(mockTx.team.findUnique).toHaveBeenCalledWith({
      where: { id: 12 },
      select: { plan: true, isActive: true },
    });
    expect(mockGetTeamCached).not.toHaveBeenCalled();
  });

  it("counts through the default client when no transaction is given", async () => {
    mockDb.contactBook.count.mockResolvedValue(0);

    await expect(LimitService.checkContactBookLimit(12)).resolves.toMatchObject(
      { isLimitReached: false, limit: 1 },
    );

    expect(mockDb.contactBook.count).toHaveBeenCalledTimes(1);
    expect(mockGetTeamCached).toHaveBeenCalledWith(12);
  });
});
