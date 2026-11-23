import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockSendMail } = vi.hoisted(() => {
  const mockDb = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    waitlistApplication: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { mockDb, mockSendMail: vi.fn() };
});

vi.mock("~/env", () => ({
  env: { FOUNDER_EMAIL: "founder@usesend.com", NEXTAUTH_URL: "https://app" },
}));
vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("~/server/platform-admin", () => ({
  isPlatformAdmin: vi.fn(async () => true),
}));
vi.mock("~/server/mailer", () => ({ sendMail: mockSendMail }));
vi.mock("~/server/logger/log", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    logger,
    getChildLogger: () => logger,
    withLogger: (_logger: unknown, fn: () => unknown) => fn(),
  };
});
vi.mock("~/utils/common", () => ({ isCloud: () => false }));
vi.mock("~/server/aws/ses", () => ({}));
vi.mock("~/server/service/ses-settings-service", () => ({}));
vi.mock("~/server/service/team-service", () => ({ TeamService: {} }));
vi.mock("~/server/service/sending-rules-service", () => ({}));
vi.mock("~/server/service/campaign-service", () => ({}));
vi.mock("~/server/service/guard-service", () => ({
  GuardConflictError: class extends Error {},
  GuardNotFoundError: class extends Error {},
}));
vi.mock("usesend-js", () => ({ UseSend: class {} }));

import { createCallerFactory } from "~/server/api/trpc";
import { adminRouter } from "~/server/api/routers/admin";

const caller = createCallerFactory(adminRouter)({
  db: mockDb,
  headers: new Headers(),
  session: {
    user: {
      id: 1,
      email: "founder@usesend.com",
      isWaitlisted: false,
      isAdmin: true,
      isBetaUser: true,
    },
  },
} as any);

const waitlisted = {
  id: 7,
  email: "dev@acme.com",
  name: "Dev",
  isWaitlisted: true,
  createdAt: new Date(),
  waitlistApplication: { status: "PENDING" },
};

beforeEach(() => {
  for (const group of [mockDb.user, mockDb.waitlistApplication]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  mockDb.$queryRaw.mockReset();
  mockDb.$transaction.mockReset();
  mockDb.$transaction.mockImplementation(async (fn: any) => fn(mockDb));
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue(undefined);
  mockDb.user.findUnique.mockResolvedValue(waitlisted);
});

describe("letting someone in", () => {
  it("sends the welcome email only for the click that let them in", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({
      ...waitlisted,
      isWaitlisted: false,
    });

    mockDb.user.updateMany.mockResolvedValueOnce({ count: 1 });
    await caller.updateUserWaitlist({ userId: 7, isWaitlisted: false });
    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7, isWaitlisted: true },
      data: { isWaitlisted: false },
    });
    expect(mockDb.waitlistApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        data: expect.objectContaining({ status: "APPROVED" }),
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // A double click or a second tab: already let in, so nothing is sent.
    mockDb.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await caller.updateUserWaitlist({ userId: 7, isWaitlisted: false });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe("letting in someone already rejected", () => {
  beforeEach(() => {
    mockDb.waitlistApplication.findUnique.mockResolvedValue({
      status: "REJECTED",
    });
    mockDb.user.findUniqueOrThrow.mockResolvedValue({
      ...waitlisted,
      isWaitlisted: false,
    });
  });

  it("is refused from the queue, so a stale tab can't welcome them", async () => {
    await expect(
      caller.updateUserWaitlist({ userId: 7, isWaitlisted: false }),
    ).rejects.toThrow("Already rejected");
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("works from the lookup's deliberate switch", async () => {
    mockDb.user.updateMany.mockResolvedValue({ count: 1 });
    await caller.updateUserWaitlist({
      userId: 7,
      isWaitlisted: false,
      overrideRejection: true,
    });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe("rejecting someone", () => {
  it("marks them rejected, then emails them", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue(waitlisted);
    await caller.rejectWaitlistUser({ userId: 7 });
    expect(mockDb.$queryRaw).toHaveBeenCalled(); // locks the user row
    expect(mockDb.waitlistApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED" }),
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it("never emails someone who already has access", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({
      ...waitlisted,
      isWaitlisted: false,
    });
    await expect(caller.rejectWaitlistUser({ userId: 7 })).rejects.toThrow(
      "already have access",
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("doesn't email twice", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue({
      ...waitlisted,
      waitlistApplication: { status: "REJECTED" },
    });
    await expect(caller.rejectWaitlistUser({ userId: 7 })).rejects.toThrow(
      "Already rejected",
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("puts them back in the queue if the email fails", async () => {
    mockDb.user.findUniqueOrThrow.mockResolvedValue(waitlisted);
    mockSendMail.mockRejectedValue(new Error("SES down"));
    await expect(caller.rejectWaitlistUser({ userId: 7 })).rejects.toThrow(
      "Failed to send",
    );
    const claim = mockDb.waitlistApplication.updateMany.mock.calls[0]?.[0];
    expect(mockDb.waitlistApplication.updateMany).toHaveBeenLastCalledWith({
      where: {
        userId: 7,
        status: "REJECTED",
        reviewedAt: claim.data.reviewedAt,
      },
      data: { status: "PENDING", reviewedAt: null },
    });
  });
});

describe("pendingApplications", () => {
  it("shows the Guard's suggested approvals first", async () => {
    mockDb.waitlistApplication.findMany.mockResolvedValue([
      { id: "a", guardVerdict: null },
      { id: "b", guardVerdict: "reject" },
      { id: "c", guardVerdict: "approve" },
      { id: "d", guardVerdict: "unsure" },
    ]);
    const list = await caller.pendingApplications();
    expect(list.map((application) => application.id)).toEqual([
      "c",
      "d",
      "b",
      "a",
    ]);
    expect(mockDb.waitlistApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING", user: { isWaitlisted: true } },
      }),
    );
  });
});
