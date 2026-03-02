import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockSendTeamInviteEmail } = vi.hoisted(() => ({
  mockDb: {
    teamUser: {
      findFirst: vi.fn(),
    },
    teamInvite: {
      findFirst: vi.fn(),
    },
  },
  mockSendTeamInviteEmail: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("~/server/mailer", () => ({
  sendMail: vi.fn(),
  sendTeamInviteEmail: mockSendTeamInviteEmail,
}));

vi.mock("~/server/service/webhook-service", () => ({}));

import { createCallerFactory } from "~/server/api/trpc";
import { teamRouter } from "~/server/api/routers/team";

const createCaller = createCallerFactory(teamRouter);

function getContext() {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: {
        id: 1,
        email: "admin@example.com",
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      },
    },
  } as any;
}

describe("teamRouter.resendTeamInvite authorization", () => {
  beforeEach(() => {
    mockDb.teamUser.findFirst.mockReset();
    mockDb.teamInvite.findFirst.mockReset();
    mockSendTeamInviteEmail.mockReset();

    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 1,
      userId: 1,
      role: "ADMIN",
      team: { id: 1, name: "Team One" },
    });
  });

  it("does not resend invites that belong to another team", async () => {
    mockDb.teamInvite.findFirst.mockResolvedValue(null);

    const caller = createCaller(getContext());

    await expect(
      caller.resendTeamInvite({ inviteId: "invite_team_2" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Invite not found",
    });

    expect(mockDb.teamInvite.findFirst).toHaveBeenCalledWith({
      where: {
        teamId: 1,
        id: {
          equals: "invite_team_2",
        },
      },
    });

    expect(mockSendTeamInviteEmail).not.toHaveBeenCalled();
  });
});
