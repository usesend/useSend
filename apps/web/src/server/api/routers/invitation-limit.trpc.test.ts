import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTx, mockLimitService } = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    teamInvite: {
      findUnique: vi.fn(),
    },
  },
  mockTx: {
    teamUser: {
      create: vi.fn(),
    },
    teamInvite: {
      delete: vi.fn(),
    },
  },
  mockLimitService: {
    checkTeamMemberLimit: vi.fn(),
    lockPlanLimit: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("~/server/service/limit-service", () => ({
  LimitService: mockLimitService,
}));

import { createCallerFactory } from "~/server/api/trpc";
import { invitationRouter } from "~/server/api/routers/invitiation";

const createCaller = createCallerFactory(invitationRouter);

function getContext() {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: {
        id: 5,
        email: "member@example.com",
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      },
    },
  } as any;
}

describe("invitationRouter.acceptTeamInvite plan limits", () => {
  beforeEach(() => {
    mockDb.teamInvite.findUnique.mockResolvedValue({
      id: "invite_1",
      teamId: 3,
      email: "member@example.com",
      role: "MEMBER",
    });
    mockDb.$transaction.mockImplementation(async (callback: any) =>
      callback(mockTx),
    );
    mockLimitService.checkTeamMemberLimit.mockResolvedValue({
      isLimitReached: false,
      limit: 2,
    });
  });

  it("checks the seat limit and joins the team under the plan-limit lock", async () => {
    const caller = createCaller(getContext());

    await expect(
      caller.acceptTeamInvite({ inviteId: "invite_1" }),
    ).resolves.toBe(true);

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockLimitService.lockPlanLimit).toHaveBeenCalledWith(
      mockTx,
      3,
      "teamMember",
    );
    expect(mockLimitService.checkTeamMemberLimit).toHaveBeenCalledWith(
      3,
      mockTx,
    );
    expect(
      mockLimitService.lockPlanLimit.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockLimitService.checkTeamMemberLimit.mock.invocationCallOrder[0]!,
    );
    expect(mockTx.teamUser.create).toHaveBeenCalledWith({
      data: { teamId: 3, userId: 5, role: "MEMBER" },
    });
    expect(mockTx.teamInvite.delete).toHaveBeenCalledWith({
      where: { id: "invite_1" },
    });
  });

  it("rejects the invite when the team has no seats left", async () => {
    mockLimitService.checkTeamMemberLimit.mockResolvedValue({
      isLimitReached: true,
      limit: 1,
      reason: "TEAM_MEMBER",
    });

    const caller = createCaller(getContext());

    await expect(
      caller.acceptTeamInvite({ inviteId: "invite_1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Team member limit reached",
    });

    expect(mockTx.teamUser.create).not.toHaveBeenCalled();
    expect(mockTx.teamInvite.delete).not.toHaveBeenCalled();
  });
});
