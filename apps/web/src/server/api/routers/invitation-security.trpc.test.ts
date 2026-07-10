import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const db = {
    teamInvite: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    teamUser: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return { mockDb: db };
});

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));

import { createCallerFactory } from "~/server/api/trpc";
import { invitationRouter } from "./invitiation";

const createCaller = createCallerFactory(invitationRouter);

function getContext(email = "member@example.com") {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: {
        id: 2,
        email,
        isAdmin: false,
        isBetaUser: true,
        isWaitlisted: false,
      },
    },
  } as never;
}

describe("invitation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$transaction.mockImplementation(
      async (callback: CallableFunction) => callback(mockDb),
    );
  });

  it("scopes an invite-link lookup to the signed-in email and expiry", async () => {
    mockDb.teamInvite.findMany.mockResolvedValue([]);
    const caller = createCaller(getContext());

    await caller.getUserInvites({ inviteId: "invite_1" });

    expect(mockDb.teamInvite.findMany).toHaveBeenCalledWith({
      where: {
        id: "invite_1",
        email: { equals: "member@example.com", mode: "insensitive" },
        expiresAt: { gt: expect.any(Date) },
      },
      include: { team: true },
    });
  });

  it("does not accept an invite that does not match the signed-in user", async () => {
    mockDb.teamInvite.findFirst.mockResolvedValue(null);
    const caller = createCaller(getContext("stranger@example.com"));

    await expect(
      caller.acceptTeamInvite({ inviteId: "invite_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.teamUser.create).not.toHaveBeenCalled();
    expect(mockDb.teamInvite.delete).not.toHaveBeenCalled();
  });

  it("adds membership and consumes a matching invite atomically", async () => {
    mockDb.teamInvite.findFirst.mockResolvedValue({
      id: "invite_1",
      teamId: 10,
      email: "member@example.com",
      role: "MEMBER",
    });
    mockDb.teamUser.create.mockResolvedValue({});
    mockDb.teamInvite.delete.mockResolvedValue({});
    const caller = createCaller(getContext());

    await expect(
      caller.acceptTeamInvite({ inviteId: "invite_1" }),
    ).resolves.toBe(true);

    expect(mockDb.teamUser.create).toHaveBeenCalledWith({
      data: { teamId: 10, userId: 2, role: "MEMBER" },
    });
    expect(mockDb.teamInvite.delete).toHaveBeenCalledWith({
      where: { id: "invite_1" },
    });
  });
});
