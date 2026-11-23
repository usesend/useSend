import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockDb, mockRefreshTeamCache, mockRedis } = vi.hoisted(() => ({
  mockEnv: { NEXT_PUBLIC_IS_CLOUD: true, REDIS_URL: "redis://localhost:6379" },
  mockRedis: { set: vi.fn(), exists: vi.fn() },
  mockDb: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    team: { findUnique: vi.fn(), updateMany: vi.fn() },
    campaign: { findMany: vi.fn(), updateMany: vi.fn() },
    teamAction: { create: vi.fn() },
    email: { findMany: vi.fn() },
    waitlistApplication: { updateMany: vi.fn(), findUnique: vi.fn() },
  },
  mockRefreshTeamCache: vi.fn(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/redis", () => ({ redisKey: (key: string) => key }));
vi.mock("ioredis", () => ({
  default: class {
    status = "ready";
    on() {}
    set = mockRedis.set;
    exists = mockRedis.exists;
  },
}));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/service/team-service", () => ({
  TeamService: { refreshTeamCache: mockRefreshTeamCache },
}));

import {
  GuardConflictError,
  GuardForbiddenError,
  GuardNotFoundError,
  assertGuardMayAct,
  campaignContentHash,
  markGuardSeen,
  recordApplicationVerdict,
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
  mockRedis.exists.mockResolvedValue(1);
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

  it("doesn't hold anything while the Guard isn't running", async () => {
    mockDb.team.findUnique.mockResolvedValue({ createdAt: new Date() });

    mockRedis.exists.mockResolvedValue(0);
    await expect(reviewHoldFor(7)).resolves.toBeNull();

    mockRedis.exists.mockRejectedValue(new Error("redis down"));
    await expect(reviewHoldFor(7)).resolves.toBeNull();

    mockRedis.exists.mockResolvedValue(1);
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;
    mockDb.team.findUnique.mockClear();
    await expect(reviewHoldFor(7)).resolves.toBeNull();
    expect(mockDb.team.findUnique).not.toHaveBeenCalled();
  });

  it("never asks Redis about older teams", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 30 * DAY),
    });
    await expect(reviewHoldFor(7)).resolves.toBeNull();
    expect(mockRedis.exists).not.toHaveBeenCalled();
  });

  it("knows the Guard is running for 2 minutes after it checks in", async () => {
    await markGuardSeen();
    expect(mockRedis.set).toHaveBeenCalledWith(
      "guard:last-seen",
      expect.any(String),
      "EX",
      120,
    );
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
  it("lets the Guard act only on new teams", () => {
    expect(() =>
      assertGuardMayAct({ createdAt: new Date(Date.now() - DAY) }),
    ).not.toThrow();
    expect(() =>
      assertGuardMayAct({ createdAt: new Date(Date.now() - 30 * DAY) }),
    ).toThrow(GuardForbiddenError);
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
      content: null as string | null,
    };
    const hash = campaignContentHash(base);
    expect(campaignContentHash({ ...base })).toBe(hash);
    expect(campaignContentHash({ ...base, replyTo: ["other@y.com"] })).not.toBe(
      hash,
    );
    expect(campaignContentHash({ ...base, subject: "Hey" })).not.toBe(hash);
    expect(campaignContentHash({ ...base, html: "<p>2</p>" })).not.toBe(hash);
    expect(campaignContentHash({ ...base, content: '{"doc":1}' })).not.toBe(
      hash,
    );
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
    content: null,
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
    mockDb.campaign.findMany.mockResolvedValueOnce([{ id: "c1" }]);
    mockDb.campaign.findMany.mockResolvedValueOnce([
      make("c1", {
        status: "SCHEDULED",
        reviewHoldUntil: new Date(Date.now() + 60_000),
        team: { id: 7, name: "Acme", createdAt: new Date(Date.now() - DAY) },
      }),
    ]);

    const page = await listActiveCampaigns({ limit: 10 });

    expect(page.items[0]?.waitingForReview).toBe(true);
    expect(page.items[0]?.team.isNew).toBe(true);
    expect(page.items[0]?.contentHash).toBe(
      campaignContentHash(make("c1") as never),
    );
    expect(page.nextCursor).toBeNull();
  });

  it("pages through campaigns", async () => {
    mockDb.campaign.findMany.mockResolvedValueOnce([
      { id: "c1" },
      { id: "c2" },
      { id: "c3" },
    ]);
    mockDb.campaign.findMany.mockResolvedValueOnce([make("c1"), make("c2")]);

    const page = await listActiveCampaigns({ limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(page.nextCursor).toBe("c2");
    expect(mockDb.campaign.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 3, select: { id: true } }),
    );
    // Content only for the page, not the extra row.
    expect(mockDb.campaign.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: { in: ["c1", "c2"] } } }),
    );
    expect(page.items[0]?.team.isNew).toBe(false);
  });

  it("truncates very large HTML but hashes all of it", async () => {
    const html = "x".repeat(150_000);
    mockDb.campaign.findMany.mockResolvedValueOnce([{ id: "c1" }]);
    mockDb.campaign.findMany.mockResolvedValueOnce([make("c1", { html })]);

    const item = (await listActiveCampaigns({ limit: 10 })).items[0]!;

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
    // Campaign emails keep only the preview in text, so HTML comes too.
    expect(items[0]?.html).toBe("<p>Hi there</p>");
  });
});

describe("recordApplicationVerdict", () => {
  beforeEach(() => {
    mockDb.waitlistApplication.updateMany.mockReset();
    mockDb.waitlistApplication.findUnique.mockReset();
  });

  it("saves advice only on a pending application", async () => {
    mockDb.waitlistApplication.updateMany.mockResolvedValue({ count: 1 });
    await recordApplicationVerdict("app_1", {
      verdict: "unsure",
      note: "Thin site",
    });
    expect(mockDb.waitlistApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "app_1", status: "PENDING" },
      data: { guardVerdict: "unsure", guardNote: "Thin site" },
    });
  });

  it("tells a decided application from a missing one", async () => {
    mockDb.waitlistApplication.updateMany.mockResolvedValue({ count: 0 });
    mockDb.waitlistApplication.findUnique.mockResolvedValue({ id: "app_1" });
    await expect(
      recordApplicationVerdict("app_1", { verdict: "reject", note: "x" }),
    ).rejects.toBeInstanceOf(GuardConflictError);

    mockDb.waitlistApplication.findUnique.mockResolvedValue(null);
    await expect(
      recordApplicationVerdict("app_2", { verdict: "reject", note: "x" }),
    ).rejects.toBeInstanceOf(GuardNotFoundError);
  });
});
