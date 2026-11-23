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
const { mockEmailTeam } = vi.hoisted(() => ({ mockEmailTeam: vi.fn() }));
vi.mock("~/server/service/team-email", () => ({ emailTeam: mockEmailTeam }));

import {
  GuardForbiddenError,
  GuardNotFoundError,
  assertGuardMayAct,
  campaignContentHash,
  markGuardSeen,
  isReviewHeld,
  listActiveCampaigns,
  listNewEmails,
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

  describe("an older team", () => {
    beforeEach(() => {
      mockDb.team.findUnique.mockResolvedValue({
        id: 7,
        name: "Motionstack",
        createdAt: new Date(Date.now() - 365 * DAY),
      });
      mockDb.team.updateMany.mockResolvedValue({ count: 1 });
      mockDb.campaign.updateMany.mockResolvedValue({ count: 0 });
    });

    it("is paused for phishing, with the emails that show it, and told why", async () => {
      mockDb.email.findMany.mockResolvedValue([
        { subject: "Your E-ZPass Invoice Notification" },
        { subject: "Your E-ZPass Invoice Notification" },
      ]);

      const result = await recordTeamAction(7, {
        action: "PAUSE",
        reason: "E-ZPass phishing",
        abuse: "phishing",
        emailIds: ["e1", "e2"],
      });

      expect(result.changed).toBe(true);
      expect(mockDb.email.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["e1", "e2"] }, teamId: 7 },
        select: { subject: true },
      });
      expect(mockEmailTeam).toHaveBeenCalledTimes(1);
      const [, subject, text] = mockEmailTeam.mock.calls[0]!;
      expect(subject).toContain("paused");
      expect(text).toContain("Your E-ZPass Invoice Notification");
      expect(text).toContain("API keys has probably leaked");
      // The AI's own wording never reaches the customer.
      expect(text).not.toContain("E-ZPass phishing");
    });

    it("isn't paused for anything else", async () => {
      await expect(
        recordTeamAction(7, { action: "PAUSE", reason: "spammy" }),
      ).rejects.toBeInstanceOf(GuardForbiddenError);
      expect(mockDb.team.updateMany).not.toHaveBeenCalled();
    });

    it("isn't paused without evidence, or with another team's emails", async () => {
      await expect(
        recordTeamAction(7, { action: "PAUSE", reason: "x", abuse: "scam" }),
      ).rejects.toThrow("emailIds");

      mockDb.email.findMany.mockResolvedValue([{ subject: "a" }]);
      await expect(
        recordTeamAction(7, {
          action: "PAUSE",
          reason: "x",
          abuse: "scam",
          emailIds: ["mine", "someone-elses"],
        }),
      ).rejects.toThrow("aren't this team's");
      expect(mockDb.team.updateMany).not.toHaveBeenCalled();
      expect(mockEmailTeam).not.toHaveBeenCalled();
    });
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

describe("listNewEmails", () => {
  const row = (id: string, at: string) => ({
    id,
    createdAt: new Date(at),
    from: "a@acme.com",
    to: ["x@gmail.com", "y@gmail.com"],
    replyTo: [],
    subject: "Hi",
    text: "t",
    html: null,
    team: {
      id: 7,
      name: "Acme",
      createdAt: new Date(Date.now() - DAY),
      isBlocked: false,
      sendingPausedAt: null,
    },
  });

  it("pages through API emails with a cursor that never skips a tie", async () => {
    mockDb.email.findMany.mockResolvedValue([
      row("e1", "2026-11-23T10:00:00.000Z"),
      row("e2", "2026-11-23T10:00:01.000Z"),
    ]);

    const page = await listNewEmails({
      cursor: "2026-11-23T09:59:59.000Z|e0",
      limit: 2,
    });

    const query = mockDb.email.findMany.mock.calls[0]![0];
    const at = new Date("2026-11-23T09:59:59.000Z");
    expect(query.where).toEqual({
      campaignId: null,
      createdAt: { gte: at },
      NOT: { createdAt: at, id: { lte: "e0" } },
    });
    expect(page.nextCursor).toBe("2026-11-23T10:00:01.000Z|e2");
    expect(page.items[0]).toMatchObject({ toDomains: ["gmail.com"] });
    expect(page.items[0]).not.toHaveProperty("to");
    expect(page.items[0]!.team.isNew).toBe(true);
  });

  it("keeps the cursor when nothing is new", async () => {
    mockDb.email.findMany.mockResolvedValue([]);
    const page = await listNewEmails({
      cursor: "2026-11-23T10:00:00.000Z|e9",
      limit: 100,
    });
    expect(page.nextCursor).toBe("2026-11-23T10:00:00.000Z|e9");
  });
});
