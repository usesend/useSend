import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
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
