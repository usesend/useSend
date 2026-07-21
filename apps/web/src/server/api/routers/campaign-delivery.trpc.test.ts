import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockScheduleCampaign } = vi.hoisted(() => ({
  mockDb: {
    teamUser: { findFirst: vi.fn() },
    campaign: { findUnique: vi.fn() },
    contact: { count: vi.fn() },
    campaignEmail: { groupBy: vi.fn() },
    email: { groupBy: vi.fn() },
  },
  mockScheduleCampaign: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("~/server/service/campaign-service", () => ({
  scheduleCampaign: mockScheduleCampaign,
}));
vi.mock("~/server/service/webhook-service", () => ({}));
vi.mock("~/server/service/domain-service", () => ({
  validateDomainFromEmail: vi.fn(),
}));
vi.mock("~/server/service/storage-service", () => ({
  getDocumentUploadUrl: vi.fn(),
  isStorageConfigured: vi.fn(() => false),
}));

import { campaignRouter } from "~/server/api/routers/campaign";
import { createCallerFactory } from "~/server/api/trpc";

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

describe("campaign delivery procedures", () => {
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
      contactBookId: "book_1",
      sent: 15,
    });
  });

  it("counts the current subscribed audience for the schedule preview", async () => {
    mockDb.contact.count.mockResolvedValue(50_000);

    const result = await createCaller(getContext()).getAudienceCount({
      campaignId: "camp_1",
    });

    expect(result).toEqual({ total: 50_000 });
    expect(mockDb.contact.count).toHaveBeenCalledWith({
      where: { contactBookId: "book_1", subscribed: true },
    });
  });

  it("returns delivery progress across recipient and email states", async () => {
    mockDb.campaignEmail.groupBy.mockResolvedValue([
      { status: "PENDING", _count: { _all: 40 } },
      { status: "QUEUED", _count: { _all: 30 } },
      { status: "SUPPRESSED", _count: { _all: 2 } },
      { status: "SKIPPED", _count: { _all: 3 } },
      { status: "FAILED", _count: { _all: 1 } },
    ]);
    mockDb.email.groupBy.mockResolvedValue([
      { latestStatus: "SCHEDULED", _count: { _all: 10 } },
      { latestStatus: "QUEUED", _count: { _all: 20 } },
      { latestStatus: "FAILED", _count: { _all: 1 } },
    ]);

    const result = await createCaller(getContext()).getDeliveryProgress({
      campaignId: "camp_1",
    });

    expect(result).toEqual({
      pending: 40,
      processed: 36,
      queued: 30,
      sent: 15,
      failed: 1,
      suppressed: 5,
    });
  });

  it("validates and forwards gradual scheduling settings", async () => {
    mockScheduleCampaign.mockResolvedValue({ ok: true });

    await createCaller(getContext()).scheduleCampaign({
      campaignId: "camp_1",
      delivery: {
        strategy: "GRADUAL",
        batchPercentage: 10,
        interval: "hour",
      },
    });

    expect(mockScheduleCampaign).toHaveBeenCalledWith({
      campaignId: "camp_1",
      teamId: 10,
      scheduledAt: undefined,
      batchSize: undefined,
      delivery: {
        strategy: "GRADUAL",
        batchPercentage: 10,
        interval: "hour",
      },
    });
  });
});
