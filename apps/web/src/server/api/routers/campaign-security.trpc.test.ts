import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockValidateDomainFromEmail, mockReviewHoldFor } = vi.hoisted(() => ({
  mockReviewHoldFor: vi.fn(),
  mockDb: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    teamUser: {
      findFirst: vi.fn(),
    },
    campaign: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    contactBook: {
      findUnique: vi.fn(),
    },
  },
  mockValidateDomainFromEmail: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("~/server/service/campaign-service", () => ({}));
vi.mock("~/server/service/guard-service", () => ({
  reviewHoldFor: mockReviewHoldFor,
}));
vi.mock("~/server/service/webhook-service", () => ({}));
vi.mock("~/server/service/domain-service", () => ({
  validateDomainFromEmail: mockValidateDomainFromEmail,
}));

import { createCallerFactory } from "~/server/api/trpc";
import { campaignRouter } from "~/server/api/routers/campaign";

const createCaller = createCallerFactory(campaignRouter);

function getContext() {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: {
        id: 1,
        email: "owner@example.com",
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      },
    },
  } as any;
}

describe("campaignRouter.updateCampaign authorization", () => {
  beforeEach(() => {
    mockDb.teamUser.findFirst.mockReset();
    mockDb.campaign.findUnique.mockReset();
    mockDb.campaign.update.mockReset();
    mockDb.campaign.create.mockReset();
    mockDb.contactBook.findUnique.mockReset();

    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 10,
      userId: 1,
      role: "ADMIN",
      team: { id: 10, name: "Acme" },
    });

    mockDb.campaign.findUnique.mockResolvedValue({
      id: "camp_1",
      teamId: 10,
      domainId: 2,
    });

    mockDb.campaign.update.mockResolvedValue({
      id: "camp_1",
      teamId: 10,
      domainId: 2,
      contactBookId: "cb_other_team",
    });

    mockDb.campaign.create.mockResolvedValue({
      id: "camp_copy",
      teamId: 10,
    });
  });

  it("rejects assigning a contact book from another team", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue(null);

    const caller = createCaller(getContext());

    await expect(
      caller.updateCampaign({
        campaignId: "camp_1",
        contactBookId: "cb_other_team",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Contact book not found",
    });

    expect(mockDb.contactBook.findUnique).toHaveBeenCalledWith({
      where: {
        id: "cb_other_team",
        teamId: 10,
      },
    });
  });
});

describe("campaignRouter.duplicateCampaign", () => {
  beforeEach(() => {
    mockDb.teamUser.findFirst.mockReset();
    mockDb.campaign.findUnique.mockReset();
    mockDb.campaign.create.mockReset();

    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 10,
      userId: 1,
      role: "ADMIN",
      team: { id: 10, name: "Acme" },
    });

    mockDb.campaign.findUnique.mockResolvedValue({
      id: "camp_1",
      teamId: 10,
      name: "Weekly update",
      from: "Team <hello@example.com>",
      replyTo: ["support@example.com"],
      cc: ["ops@example.com"],
      bcc: ["audit@example.com"],
      subject: "This week",
      previewText: "Quick overview",
      content: '{"root":{}}',
      html: "<p>This week</p>",
      domainId: 2,
      contactBookId: "cb_1",
    });

    mockDb.campaign.create.mockResolvedValue({
      id: "camp_copy",
      teamId: 10,
    });
  });

  it("duplicates reply-to and other email headers", async () => {
    const caller = createCaller(getContext());

    await caller.duplicateCampaign({
      campaignId: "camp_1",
    });

    expect(mockDb.campaign.create).toHaveBeenCalledWith({
      data: {
        name: "Weekly update (Copy)",
        from: "Team <hello@example.com>",
        replyTo: ["support@example.com"],
        cc: ["ops@example.com"],
        bcc: ["audit@example.com"],
        subject: "This week",
        previewText: "Quick overview",
        content: '{"root":{}}',
        html: "<p>This week</p>",
        teamId: 10,
        domainId: 2,
        contactBookId: "cb_1",
      },
    });
  });
});

describe("campaignRouter.updateCampaign and the Guard's review", () => {
  const until = new Date(Date.now() + 10 * 60_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 10,
      userId: 1,
      role: "ADMIN",
      team: { id: 10, name: "Acme" },
    });
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "camp_1",
      teamId: 10,
      domainId: 2,
      status: "PAUSED",
    });
    mockDb.campaign.update.mockResolvedValue({ id: "camp_1" });
    mockDb.$transaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => unknown) => fn(mockDb),
    );
  });

  it("decides on a new hold from the current state, under the team lock", async () => {
    mockReviewHoldFor.mockResolvedValue(until);
    // Read as PAUSED when the request started; approved and sending by the
    // time the edit is written.
    mockDb.campaign.findUnique
      .mockResolvedValueOnce({ id: "camp_1", teamId: 10, domainId: 2, status: "PAUSED" })
      .mockResolvedValueOnce({ status: "SCHEDULED" });

    await createCaller(getContext()).updateCampaign({
      campaignId: "camp_1",
      subject: "New subject",
    });

    expect(mockDb.$queryRaw).toHaveBeenCalled();
    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "camp_1" },
      data: expect.objectContaining({
        subject: "New subject",
        reviewHoldUntil: until,
      }),
    });
  });

  it("doesn't hold a campaign that isn't sending", async () => {
    mockReviewHoldFor.mockResolvedValue(until);
    mockDb.campaign.findUnique
      .mockResolvedValueOnce({ id: "camp_1", teamId: 10, domainId: 2, status: "DRAFT" })
      .mockResolvedValueOnce({ status: "DRAFT" });

    await createCaller(getContext()).updateCampaign({
      campaignId: "camp_1",
      subject: "Draft subject",
    });

    expect(mockDb.campaign.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      "reviewHoldUntil",
    );
  });

  it("works as before when there's no hold to apply", async () => {
    mockReviewHoldFor.mockResolvedValue(null);

    await createCaller(getContext()).updateCampaign({
      campaignId: "camp_1",
      subject: "New subject",
    });

    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.campaign.update).toHaveBeenCalledTimes(1);
  });
});
