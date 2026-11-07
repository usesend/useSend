import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockCheckTeamMemberLimit } = vi.hoisted(() => ({
  mockCheckTeamMemberLimit: vi.fn(),
  mockDb: {
    teamInvite: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    teamUser: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/service/limit-service", () => ({
  LimitService: { checkTeamMemberLimit: mockCheckTeamMemberLimit },
}));

vi.mock("~/server/service/plan-limit-lock", () => ({
  withPlanLimitLock: (_teamId: number, _resource: string, fn: () => unknown) =>
    fn(),
}));

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

import { createCallerFactory } from "~/server/api/trpc";
import { invitationRouter } from "~/server/api/routers/invitiation";

const createCaller = createCallerFactory(invitationRouter);

function getContext(email: string | null = "member@example.com") {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: {
        id: 7,
        email,
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      },
    },
  } as any;
}

const emailFilter = (email: string) => ({
  equals: email,
  mode: "insensitive",
});

describe("invitationRouter is bound to the invited email", () => {
  beforeEach(() => {
    mockDb.teamInvite.findFirst.mockReset();
    mockDb.teamInvite.findMany.mockReset();
    mockDb.teamInvite.delete.mockReset();
    mockDb.teamUser.create.mockReset();
    mockDb.$transaction.mockReset();
    mockDb.$transaction.mockResolvedValue([]);
    mockCheckTeamMemberLimit.mockReset();
    mockCheckTeamMemberLimit.mockResolvedValue({ isLimitReached: false });
  });

  it("does not let anyone join a team that is at its member limit", async () => {
    mockDb.teamInvite.findFirst.mockResolvedValue({
      id: "inv_1",
      teamId: 3,
      role: "MEMBER",
      email: "member@example.com",
    });
    mockCheckTeamMemberLimit.mockResolvedValue({ isLimitReached: true });

    await expect(
      createCaller(getContext()).acceptTeamInvite({ inviteId: "inv_1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockCheckTeamMemberLimit).toHaveBeenCalledWith(3);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("does not let a user accept an invite sent to another email", async () => {
    mockDb.teamInvite.findFirst.mockResolvedValue(null);

    await expect(
      createCaller(getContext()).acceptTeamInvite({ inviteId: "inv_admin" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.teamInvite.findFirst).toHaveBeenCalledWith({
      where: { id: "inv_admin", email: emailFilter("member@example.com") },
    });
    expect(mockDb.teamUser.create).not.toHaveBeenCalled();
    expect(mockDb.teamInvite.delete).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("rejects users without an email", async () => {
    await expect(
      createCaller(getContext(null)).acceptTeamInvite({ inviteId: "inv_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.teamInvite.findFirst).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("accepts an invite addressed to the signed-in user", async () => {
    mockDb.teamInvite.findFirst.mockResolvedValue({
      id: "inv_1",
      teamId: 3,
      role: "ADMIN",
      email: "Member@Example.com",
    });

    await expect(
      createCaller(getContext()).acceptTeamInvite({ inviteId: "inv_1" }),
    ).resolves.toBe(true);

    expect(mockDb.teamUser.create).toHaveBeenCalledWith({
      data: { teamId: 3, userId: 7, role: "ADMIN" },
    });
    expect(mockDb.teamInvite.delete).toHaveBeenCalledWith({
      where: { id: "inv_1" },
    });
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it("only lists invites for the signed-in email, even with an invite id", async () => {
    mockDb.teamInvite.findMany.mockResolvedValue([]);

    await createCaller(getContext()).getUserInvites({ inviteId: "inv_other" });

    expect(mockDb.teamInvite.findMany).toHaveBeenCalledWith({
      where: { email: emailFilter("member@example.com"), id: "inv_other" },
      include: { team: true },
    });
  });

  it("does not return an invite by id to someone else", async () => {
    mockDb.teamInvite.findFirst.mockResolvedValue(null);

    await expect(
      createCaller(getContext()).getInvite({ inviteId: "inv_other" }),
    ).resolves.toBeNull();

    expect(mockDb.teamInvite.findFirst).toHaveBeenCalledWith({
      where: { id: "inv_other", email: emailFilter("member@example.com") },
    });
  });
});
