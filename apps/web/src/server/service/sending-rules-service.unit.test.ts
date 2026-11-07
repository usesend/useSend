import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnv,
  mockDb,
  redisStore,
  mockSendToDiscord,
  mockSendMail,
  mockRefreshTeamCache,
} = vi.hoisted(() => ({
  mockEnv: {
    NEXT_PUBLIC_IS_CLOUD: true,
    SENDING_RULES_MODE: "enforce" as "off" | "alert" | "enforce",
  },
  mockDb: {
    team: { findUnique: vi.fn(), updateMany: vi.fn() },
    campaign: { findFirst: vi.fn(), updateMany: vi.fn() },
    teamAction: { findFirst: vi.fn(), create: vi.fn() },
    dailyEmailUsage: { aggregate: vi.fn() },
  },
  redisStore: new Set<string>(),
  mockSendToDiscord: vi.fn(),
  mockSendMail: vi.fn(),
  mockRefreshTeamCache: vi.fn(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/mailer", () => ({ sendMail: mockSendMail }));
vi.mock("~/server/redis", () => ({
  redisKey: (key: string) => key,
  getRedis: () => ({
    set: vi.fn(async (key: string) => {
      if (redisStore.has(key)) return null;
      redisStore.add(key);
      return "OK";
    }),
  }),
}));
vi.mock("~/server/service/notification-service", () => ({
  sendToDiscord: mockSendToDiscord,
}));
vi.mock("~/server/service/team-service", () => ({
  TeamService: {
    refreshTeamCache: mockRefreshTeamCache,
    getTeamUsers: vi.fn(async () => [
      { user: { email: "owner@acme.com" } },
      { user: { email: null } },
    ]),
  },
}));

import {
  checkSendingHealth,
  isSpamTrapBounce,
  judgeCounts,
} from "~/server/service/sending-rules-service";

function usage(sent: number, hardBounced: number, complained = 0) {
  mockDb.dailyEmailUsage.aggregate.mockResolvedValue({
    _sum: { sent, hardBounced, complained },
  });
}

describe("judgeCounts", () => {
  it("needs both the rate and a minimum count", () => {
    expect(judgeCounts({ sent: 10, hardBounced: 4, complained: 0 }).level).toBe(
      "ok",
    );
    expect(
      judgeCounts({ sent: 1000, hardBounced: 25, complained: 0 }).level,
    ).toBe("ok");
    expect(
      judgeCounts({ sent: 1000, hardBounced: 26, complained: 0 }).level,
    ).toBe("pause");
    expect(
      judgeCounts({ sent: 1000, hardBounced: 51, complained: 0 }).level,
    ).toBe("block");
    expect(
      judgeCounts({ sent: 100, hardBounced: 9, complained: 0 }).level,
    ).toBe("pause");
  });

  it("checks spam complaints", () => {
    expect(
      judgeCounts({ sent: 1000, hardBounced: 0, complained: 1 }).level,
    ).toBe("ok");
    expect(
      judgeCounts({ sent: 1000, hardBounced: 0, complained: 2 }).level,
    ).toBe("pause");
    expect(
      judgeCounts({ sent: 1000, hardBounced: 0, complained: 4 }).level,
    ).toBe("block");
    expect(
      judgeCounts({ sent: 100_000, hardBounced: 0, complained: 50 }).level,
    ).toBe("ok");
  });

  it("explains the reason in plain words", () => {
    expect(judgeCounts({ sent: 1000, hardBounced: 30, complained: 0 })).toEqual(
      {
        level: "pause",
        reason: "too many emails bounced: 3.00% (30 of 1,000)",
      },
    );
  });
});

describe("isSpamTrapBounce", () => {
  it("spots spam traps and honeypots in bounce diagnostics", () => {
    expect(
      isSpamTrapBounce({
        bouncedRecipients: [
          { diagnosticCode: "550 5.7.1 Message rejected: spam-trap hit" },
        ],
      }),
    ).toBe(true);
    expect(
      isSpamTrapBounce({
        bouncedRecipients: [{ diagnosticCode: "550 honeypot address" }],
      }),
    ).toBe(true);
    expect(
      isSpamTrapBounce({
        bouncedRecipients: [{ diagnosticCode: "550 5.1.1 user unknown" }],
      }),
    ).toBe(false);
    expect(isSpamTrapBounce(undefined)).toBe(false);
  });
});

describe("checkSendingHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockEnv.SENDING_RULES_MODE = "enforce";
    mockDb.team.findUnique.mockResolvedValue({ name: "Acme" });
    mockDb.team.updateMany.mockResolvedValue({ count: 1 });
    mockDb.campaign.updateMany.mockResolvedValue({ count: 1 });
    mockDb.teamAction.findFirst.mockResolvedValue(null);
    usage(1000, 0, 0);
  });

  it("does nothing while rates are healthy", async () => {
    await checkSendingHealth({ teamId: 1 });

    expect(mockDb.team.updateMany).not.toHaveBeenCalled();
    expect(mockSendToDiscord).not.toHaveBeenCalled();
  });

  it("pauses the team, its campaigns, and tells everyone", async () => {
    usage(1000, 30);

    await checkSendingHealth({ teamId: 1 });

    expect(mockDb.team.updateMany).toHaveBeenCalledWith({
      where: { id: 1, isBlocked: false, sendingPausedAt: null },
      data: { sendingPausedAt: expect.any(Date) },
    });
    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: { teamId: 1, status: { in: ["RUNNING", "SCHEDULED"] } },
      data: { status: "PAUSED" },
    });
    expect(mockRefreshTeamCache).toHaveBeenCalledWith(1);
    expect(mockDb.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 1,
        action: "PAUSE",
        actor: "rules",
      }),
    });
    expect(mockSendToDiscord).toHaveBeenCalledWith(
      expect.stringContaining("Paused Acme (#1)"),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0]?.[0]).toBe("owner@acme.com");
  });

  it("acts only once when the team was already paused", async () => {
    usage(1000, 30);
    mockDb.team.updateMany.mockResolvedValue({ count: 0 });

    await checkSendingHealth({ teamId: 1 });

    expect(mockDb.teamAction.create).not.toHaveBeenCalled();
    expect(mockSendToDiscord).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("blocks at the higher level", async () => {
    usage(1000, 0, 4);

    await checkSendingHealth({ teamId: 1 });

    expect(mockDb.team.updateMany).toHaveBeenCalledWith({
      where: { id: 1, isBlocked: false },
      data: { isBlocked: true },
    });
    expect(mockDb.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "BLOCK" }),
    });
  });

  it("blocks at once on a spam trap", async () => {
    await checkSendingHealth({ teamId: 1, spamTrap: true });

    expect(mockDb.team.updateMany).toHaveBeenCalledWith({
      where: { id: 1, isBlocked: false },
      data: { isBlocked: true },
    });
    expect(mockDb.dailyEmailUsage.aggregate).not.toHaveBeenCalled();
  });

  it("only alerts, once a day, in alert mode", async () => {
    mockEnv.SENDING_RULES_MODE = "alert";
    usage(1000, 30);

    await checkSendingHealth({ teamId: 1 });
    await checkSendingHealth({ teamId: 1 });

    expect(mockDb.team.updateMany).not.toHaveBeenCalled();
    expect(mockDb.campaign.updateMany).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockDb.teamAction.create).toHaveBeenCalledTimes(1);
    expect(mockDb.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ALERT" }),
    });
    expect(mockSendToDiscord).toHaveBeenCalledTimes(1);
    expect(mockSendToDiscord).toHaveBeenCalledWith(
      expect.stringContaining("[alert only] Would pause"),
    );
  });

  it("pauses a bad campaign without pausing the team", async () => {
    mockDb.campaign.findFirst.mockResolvedValue({
      id: "cmp_1",
      name: "November news",
      sent: 400,
      hardBounced: 20,
      complained: 0,
    });

    await checkSendingHealth({ teamId: 1, campaignId: "cmp_1" });

    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "cmp_1", status: { in: ["RUNNING", "SCHEDULED"] } },
      data: { status: "PAUSED" },
    });
    expect(mockDb.team.updateMany).not.toHaveBeenCalled();
    expect(mockSendMail.mock.calls[0]?.[1]).toContain("November news");
  });

  it("doesn't pause a campaign again after its owner resumed it", async () => {
    mockDb.campaign.findFirst.mockResolvedValue({
      id: "cmp_1",
      name: "November news",
      sent: 400,
      hardBounced: 20,
      complained: 0,
    });
    mockDb.teamAction.findFirst.mockImplementation(async (args: any) =>
      args.where.details ? { id: "act_1" } : null,
    );

    await checkSendingHealth({ teamId: 1, campaignId: "cmp_1" });

    expect(mockDb.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("ignores days up to an admin resume", async () => {
    const resumedAt = new Date();
    mockDb.teamAction.findFirst.mockResolvedValue({ createdAt: resumedAt });

    await checkSendingHealth({ teamId: 1 });

    const tomorrow = new Date(resumedAt);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(mockDb.dailyEmailUsage.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId: 1,
          date: { gte: tomorrow.toISOString().split("T")[0] },
        },
      }),
    );
  });

  it("is off on self-hosted and when switched off", async () => {
    usage(1000, 500);
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;
    await checkSendingHealth({ teamId: 1, spamTrap: true });

    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockEnv.SENDING_RULES_MODE = "off";
    await checkSendingHealth({ teamId: 1, spamTrap: true });

    expect(mockDb.team.updateMany).not.toHaveBeenCalled();
    expect(mockDb.dailyEmailUsage.aggregate).not.toHaveBeenCalled();
  });
});
