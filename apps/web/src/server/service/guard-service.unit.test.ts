import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockDb, mockRefreshTeamCache } = vi.hoisted(() => ({
  mockEnv: {
    NEXT_PUBLIC_IS_CLOUD: true,
    GUARD_REVIEW_NEW_TEAMS: "true" as string | undefined,
    GUARD_ACTIONS: undefined as string | undefined,
  },
  mockDb: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    team: { findUnique: vi.fn(), updateMany: vi.fn() },
    campaign: { findMany: vi.fn(), updateMany: vi.fn() },
    teamAction: { create: vi.fn() },
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
  GuardForbiddenError,
  GuardNotFoundError,
  assertGuardMayAct,
  campaignContentHash,
  isReviewHeld,
  listActiveCampaigns,
  recordTeamAction,
  reviewHoldFor,
  sampleTeamEmails,
} from "~/server/service/guard-service";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
  mockEnv.GUARD_REVIEW_NEW_TEAMS = "true";
  mockEnv.GUARD_ACTIONS = undefined;
  mockDb.$transaction.mockImplementation(
    async (fn: (tx: typeof mockDb) => unknown) => fn(mockDb),
  );
  mockDb.$queryRaw.mockResolvedValue([{ id: 7 }]);
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
    expect(isReviewHeld({ reviewHoldUntil: new Date(Date.now() - 1) })).toBe(
      false,
    );
  });
});

describe("assertGuardMayAct", () => {
  it("lets the Guard act only on new teams, unless allowed for all", () => {
    expect(() =>
      assertGuardMayAct({ createdAt: new Date(Date.now() - DAY) }),
    ).not.toThrow();
    expect(() =>
      assertGuardMayAct({ createdAt: new Date(Date.now() - 30 * DAY) }),
    ).toThrow(GuardForbiddenError);

    mockEnv.GUARD_ACTIONS = "all";
    expect(() =>
      assertGuardMayAct({ createdAt: new Date(Date.now() - 30 * DAY) }),
    ).not.toThrow();
  });
});

describe("campaignContentHash", () => {
  it("changes with anything the Guard judges, reply-to included", () => {
    const base = {
      from: "a@x.com",
      replyTo: ["r@x.com"],
      subject: "Hi",
      previewText: null,
      html: "<p>1</p>",
    };
    const hash = campaignContentHash(base);
    expect(campaignContentHash({ ...base })).toBe(hash);
    expect(
      campaignContentHash({ ...base, replyTo: ["other@y.com"] }),
    ).not.toBe(hash);
    expect(campaignContentHash({ ...base, subject: "Hey" })).not.toBe(hash);
    expect(campaignContentHash({ ...base, html: "<p>2</p>" })).not.toBe(hash);
  });
});

describe("listActiveCampaigns", () => {
  const make = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: id,
    status: "RUNNING",
    from: "a@x.com",
    replyTo: [],
    subject: "Hi",
    previewText: null,
    html: "<p>x</p>",
    total: 1,
    sent: 0,
    scheduledAt: null,
    reviewHoldUntil: null,
    guardStoppedAt: null,
    createdAt: new Date(),
    team: { id: 7, name: "Acme", createdAt: new Date(Date.now() - 90 * DAY) },
    ...overrides,
  });

  it("marks new teams and campaigns waiting for review", async () => {
    mockDb.campaign.findMany.mockResolvedValueOnce([
      make("c1", {
        status: "SCHEDULED",
        reviewHoldUntil: new Date(Date.now() + 60_000),
        team: { id: 7, name: "Acme", createdAt: new Date(Date.now() - DAY) },
      }),
    ]);

    const page = await listActiveCampaigns({ limit: 25 });

    expect(page.items[0]?.waitingForReview).toBe(true);
    expect(page.items[0]?.team.isNew).toBe(true);
    expect(page.items[0]?.contentHash).toBe(
      campaignContentHash(make("c1") as never),
    );
    expect(page.nextCursor).toBeNull();
  });

  it("pages through campaigns", async () => {
    mockDb.campaign.findMany.mockResolvedValueOnce([
      make("c1"),
      make("c2"),
      make("c3"),
    ]);

    const page = await listActiveCampaigns({ limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(page.nextCursor).toBe("c2");
    expect(mockDb.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(page.items[0]?.team.isNew).toBe(false);
  });

  it("truncates very large HTML but hashes all of it", async () => {
    const html = "x".repeat(150_000);
    mockDb.campaign.findMany.mockResolvedValueOnce([make("c1", { html })]);

    const item = (await listActiveCampaigns({ limit: 25 })).items[0]!;

    expect(item.html?.length).toBe(100_000);
    expect(item.htmlTruncated).toBe(true);
    expect(item.contentHash).toBe(
      campaignContentHash(make("c1", { html }) as never),
    );
  });
});

describe("recordTeamAction", () => {
  beforeEach(() => {
    mockDb.team.findUnique.mockResolvedValue({
      id: 7,
      createdAt: new Date(Date.now() - DAY),
    });
  });

  it("an alert only logs", async () => {
    const result = await recordTeamAction(7, {
      action: "ALERT",
      reason: "sends look like lead gen",
    });

    expect(result.changed).toBe(false);
    expect(mockDb.team.updateMany).not.toHaveBeenCalled();
    expect(mockDb.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ALERT",
        actor: "guard",
        details: { source: "guard" },
      }),
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
    expect(mockDb.$queryRaw).toHaveBeenCalled();
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

  it("won't pause a team past its first 14 days", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      id: 7,
      createdAt: new Date(Date.now() - 30 * DAY),
    });

    await expect(
      recordTeamAction(7, { action: "PAUSE", reason: "x" }),
    ).rejects.toBeInstanceOf(GuardForbiddenError);
    expect(mockDb.team.updateMany).not.toHaveBeenCalled();
  });

  it("says when the team doesn't exist", async () => {
    mockDb.team.findUnique.mockResolvedValue(null);
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

    const { items } = await sampleTeamEmails(7, { limit: 10 });

    expect(items[0]).not.toHaveProperty("to");
    expect(items[0]?.toDomains).toEqual(["gmail.com", "corp.io"]);
    expect(items[0]?.text).toBe("Hi there");
    expect(items[0]?.html).toBeNull();
  });
});
