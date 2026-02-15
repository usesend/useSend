import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    teamUser: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

import {
  authedProcedure,
  createCallerFactory,
  createTRPCRouter,
  protectedProcedure,
  teamAdminProcedure,
  teamProcedure,
} from "~/server/api/trpc";

const testRouter = createTRPCRouter({
  authedPing: authedProcedure.query(({ ctx }) => ({
    userId: ctx.session.user.id,
  })),
  protectedPing: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.session.user.id,
  })),
  teamPing: teamProcedure.query(({ ctx }) => ({ teamId: ctx.team.id })),
  teamAdminPing: teamAdminProcedure.query(({ ctx }) => ({
    role: ctx.teamUser.role,
  })),
});

const createCaller = createCallerFactory(testRouter);

function getContext(session: Record<string, unknown> | null) {
  return {
    db: mockDb,
    session,
    headers: new Headers(),
  } as any;
}

const baseUser = {
  id: 1,
  isBetaUser: true,
  isAdmin: false,
  isWaitlisted: false,
  email: "user@example.com",
};

describe("tRPC middleware procedures", () => {
  beforeEach(() => {
    mockDb.teamUser.findFirst.mockReset();
  });

  it("blocks authed procedure without session", async () => {
    const caller = createCaller(getContext(null));
    await expect(caller.authedPing()).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.authedPing()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("blocks protected procedure for waitlisted users", async () => {
    const caller = createCaller(
      getContext({
        user: { ...baseUser, isWaitlisted: true },
      }),
    );

    await expect(caller.protectedPing()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("loads team context for team procedure", async () => {
    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 10,
      userId: 1,
      role: "ADMIN",
      team: { id: 10, name: "Acme" },
    });

    const caller = createCaller(
      getContext({
        user: baseUser,
      }),
    );

    await expect(caller.teamPing()).resolves.toEqual({ teamId: 10 });
  });

  it("blocks team admin procedure for non-admin team users", async () => {
    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 10,
      userId: 1,
      role: "MEMBER",
      team: { id: 10, name: "Acme" },
    });

    const caller = createCaller(
      getContext({
        user: baseUser,
      }),
    );

    await expect(caller.teamAdminPing()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("fails team procedure when user has no team", async () => {
    mockDb.teamUser.findFirst.mockResolvedValue(null);

    const caller = createCaller(
      getContext({
        user: baseUser,
      }),
    );

    await expect(caller.teamPing()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
