import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockDb, mockRefreshTeamCache } = vi.hoisted(() => ({
  mockEnv: {
    NEXT_PUBLIC_IS_CLOUD: true,
    GUARD_REVIEW_NEW_TEAMS: "true" as string | undefined,
  },
  mockDb: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    team: { findUnique: vi.fn(), updateMany: vi.fn() },
    campaign: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    teamAction: { findFirst: vi.fn(), create: vi.fn() },
    email: { findMany: vi.fn() },
  },
  mockRefreshTeamCache: vi.fn(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/service/team-service", () => ({
  TeamService: { refreshTeamCache: mockRefreshTeamCache },
}));

import {
  GuardConflictError,
  GuardNotFoundError,
  isReviewHeld,
  listActiveCampaigns,
  recordTeamAction,
  reviewCampaign,
  reviewHoldFor,
  sampleTeamEmails,
  stoppedByGuard,
} from "~/server/service/guard-service";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
  mockEnv.GUARD_REVIEW_NEW_TEAMS = "true";
  mockDb.$transaction.mockImplementation(
    async (fn: (tx: typeof mockDb) => unknown) => fn(mockDb),
  );
  mockDb.$queryRaw.mockResolvedValue([{ id: 7 }]);
  mockDb.teamAction.findFirst.mockResolvedValue(null);
});

describe("reviewHoldFor", () => {
  it("holds a new team's campaign for 10 minutes", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 3 * DAY),
    });

    const until = await reviewHoldFor(7);

    expect(until).toBeInstanceOf(Date);
    const minutes = (until!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  it("doesn't hold a team past its 14 days", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 15 * DAY),
    });
    await expect(reviewHoldFor(7)).resolves.toBeNull();
  });

  it("doesn't hold anything unless it's switched on", async () => {
    mockDb.team.findUnique.mockResolvedValue({ createdAt: new Date() });

    mockEnv.GUARD_REVIEW_NEW_TEAMS = undefined;
    await expect(reviewHoldFor(7)).resolves.toBeNull();

    mockEnv.GUARD_REVIEW_NEW_TEAMS = "false";
    await expect(reviewHoldFor(7)).resolves.toBeNull();

    mockEnv.GUARD_REVIEW_NEW_TEAMS = "true";
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;
    await expect(reviewHoldFor(7)).resolves.toBeNull();

    expect(mockDb.team.findUnique).not.toHaveBeenCalled();
  });
});

describe("isReviewHeld", () => {
  it("is held only until the time passes", () => {
    expect(isReviewHeld({ reviewHoldUntil: null })).toBe(false);
    expect(
      isReviewHeld({ reviewHoldUntil: new Date(Date.now() + 60_000) }),
    ).toBe(true);
    expect(
      isReviewHeld({ reviewHoldUntil: new Date(Date.now() - 1) }),
    ).toBe(false);
  });
});

describe("stoppedByGuard", () => {
  it("is stopped after a Guard pause with no later release", async () => {
    mockDb.teamAction.findFirst
      .mockResolvedValueOnce({ createdAt: new Date() })
      .mockResolvedValueOnce(null);
    await expect(stoppedByGuard(7, "cmp_1")).resolves.toBe(true);
  });

  it("isn't stopped once released", async () => {
    mockDb.teamAction.findFirst
      .mockResolvedValueOnce({ createdAt: new Date() })
      .mockResolvedValueOnce({ id: "release" });
    await expect(stoppedByGuard(7, "cmp_1")).resolves.toBe(false);
  });

  it("isn't stopped when the Guard never stopped it", async () => {
    await expect(stoppedByGuard(7, "cmp_1")).resolves.toBe(false);
  });
});

describe("listActiveCampaigns", () => {
  it("marks new teams and campaigns waiting for review, and changes the hash with the content", async () => {
    const base = {
      id: "cmp_1",
      name: "Launch",
      status: "SCHEDULED",
      from: "a@x.com",
      replyTo: [],
      subject: "Hi",
      previewText: null,
      html: "<p>one</p>",
      total: 10,
      sent: 0,
      scheduledAt: null,
      reviewHoldUntil: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      team: { id: 7, name: "Acme", createdAt: new Date(Date.now() - DAY) },
    };
    mockDb.campaign.findMany.mockResolvedValueOnce([base]);
    const first = (await listActiveCampaigns()).items[0]!;
    mockDb.campaign.findMany.mockResolvedValueOnce([
      { ...base, html: "<p>two</p>" },
    ]);
    const second = (await listActiveCampaigns()).items[0]!;

    expect(first.waitingForReview).toBe(true);
    expect(first.team.isNew).toBe(true);
    expect(first.contentHash).not.toBe(second.contentHash);
  });
});

describe("reviewCampaign", () => {
  const campaign = {
    id: "cmp_1",
    teamId: 7,
    status: "SCHEDULED",
    name: "Launch",
  };

  it("approving lets a waiting campaign send now", async () => {
    mockDb.campaign.findUnique.mockResolvedValue(campaign);

    await reviewCampaign("cmp_1", { decision: "approve", reason: "looks fine" });

    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "cmp_1" },
      data: { reviewHoldUntil: null },
    });
    expect(mockDb.teamAction.create).not.toHaveBeenCalled();
  });

  it("stopping pauses the campaign and logs it under the team lock", async () => {
    mockDb.campaign.findUnique.mockResolvedValue(campaign);
    mockDb.campaign.updateMany.mockResolvedValue({ count: 1 });

    const result = await reviewCampaign("cmp_1", {
      decision: "stop",
      reason: "cold outreach to bought list",
    });

    expect(result.status).toBe("PAUSED");
    expect(mockDb.$queryRaw).toHaveBeenCalled();
    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "cmp_1", status: { in: ["SCHEDULED", "RUNNING"] } },
      data: { status: "PAUSED", reviewHoldUntil: null },
    });
    expect(mockDb.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 7,
        action: "PAUSE",
        actor: "guard",
        details: { scope: "campaign", campaignId: "cmp_1" },
      }),
    });
  });

  it("can't stop a campaign that isn't sending", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({ ...campaign, status: "SENT" });
    mockDb.campaign.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reviewCampaign("cmp_1", { decision: "stop", reason: "spam" }),
    ).rejects.toBeInstanceOf(GuardConflictError);
    expect(mockDb.teamAction.create).not.toHaveBeenCalled();
  });

  it("approving a campaign the Guard stopped restarts it and logs the release", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      ...campaign,
      status: "PAUSED",
    });
    mockDb.teamAction.findFirst
      .mockResolvedValueOnce({ createdAt: new Date() })
      .mockResolvedValueOnce(null);
    mockDb.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: null,
    });

    const result = await reviewCampaign("cmp_1", {
      decision: "approve",
      reason: "checked with the customer",
    });

    expect(result.status).toBe("SCHEDULED");
    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "cmp_1" },
      data: { status: "SCHEDULED", reviewHoldUntil: null },
    });
    expect(mockDb.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "RESUME",
        actor: "guard",
        details: { scope: "campaign", campaignId: "cmp_1" },
      }),
    });
  });

  it("won't restart a stopped campaign while its team is paused", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      ...campaign,
      status: "PAUSED",
    });
    mockDb.teamAction.findFirst
      .mockResolvedValueOnce({ createdAt: new Date() })
      .mockResolvedValueOnce(null);
    mockDb.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: new Date(),
    });

    await expect(
      reviewCampaign("cmp_1", { decision: "approve", reason: "ok" }),
    ).rejects.toBeInstanceOf(GuardConflictError);
    expect(mockDb.campaign.update).not.toHaveBeenCalled();
  });

  it("says when the campaign doesn't exist", async () => {
    mockDb.campaign.findUnique.mockResolvedValue(null);
    await expect(
      reviewCampaign("nope", { decision: "approve", reason: "ok" }),
    ).rejects.toBeInstanceOf(GuardNotFoundError);
  });
});

describe("recordTeamAction", () => {
  it("an alert only logs", async () => {
    mockDb.team.findUnique.mockResolvedValue({ id: 7 });

    const result = await recordTeamAction(7, {
      action: "ALERT",
      reason: "sends look like lead gen",
    });

    expect(result.changed).toBe(false);
    expect(mockDb.team.updateMany).not.toHaveBeenCalled();
    expect(mockDb.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ALERT", actor: "guard" }),
    });
  });

  it("a pause stops the team and its campaigns, and refreshes the cache", async () => {
    mockDb.team.updateMany.mockResolvedValue({ count: 1 });
    mockDb.campaign.updateMany.mockResolvedValue({ count: 2 });

    const result = await recordTeamAction(7, {
      action: "PAUSE",
      reason: "phishing content",
    });

    expect(result.changed).toBe(true);
    expect(mockDb.team.updateMany).toHaveBeenCalledWith({
      where: { id: 7, isBlocked: false, sendingPausedAt: null },
      data: { sendingPausedAt: expect.any(Date) },
    });
    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: { teamId: 7, status: { in: ["RUNNING", "SCHEDULED"] } },
      data: { status: "PAUSED" },
    });
    expect(mockRefreshTeamCache).toHaveBeenCalledWith(7);
  });

  it("does nothing more for a team that's already paused or blocked", async () => {
    mockDb.team.updateMany.mockResolvedValue({ count: 0 });

    const result = await recordTeamAction(7, { action: "PAUSE", reason: "x" });

    expect(result.changed).toBe(false);
    expect(mockDb.teamAction.create).not.toHaveBeenCalled();
    expect(mockRefreshTeamCache).not.toHaveBeenCalled();
  });

  it("says when the team doesn't exist", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await expect(
      recordTeamAction(99, { action: "PAUSE", reason: "x" }),
    ).rejects.toBeInstanceOf(GuardNotFoundError);
  });
});

describe("sampleTeamEmails", () => {
  it("returns content but only the recipients' domains", async () => {
    mockDb.email.findMany.mockResolvedValue([
      {
        id: "e1",
        createdAt: new Date(),
        from: "hi@acme.com",
        to: ["alice@gmail.com", "bob@gmail.com", "carol@corp.io"],
        subject: "Hello",
        text: "Hi there",
        html: "<p>Hi there</p>",
        latestStatus: "DELIVERED",
        campaignId: null,
      },
    ]);

    const { items } = await sampleTeamEmails(7, { limit: 20 });

    expect(items[0]).not.toHaveProperty("to");
    expect(items[0]?.toDomains).toEqual(["gmail.com", "corp.io"]);
    expect(items[0]?.text).toBe("Hi there");
    expect(items[0]?.html).toBeNull();
  });
});
