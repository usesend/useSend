import { TRPCError } from "@trpc/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

import {
  createCallerFactory,
  createTRPCRouter,
  protectedProcedure,
  teamProcedure,
} from "~/server/api/trpc";
import { Role } from "@prisma/client";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetDatabase,
  resetRedis,
} from "~/test/integration/helpers";
import { createTeamWithUser, createUser } from "~/test/factories/core";

const describeIntegration = integrationEnabled ? describe : describe.skip;

const testRouter = createTRPCRouter({
  protectedPing: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.session.user.id,
  })),
  teamPing: teamProcedure.query(({ ctx }) => ({
    teamId: ctx.team.id,
    role: ctx.teamUser.role,
  })),
});

const createCaller = createCallerFactory(testRouter);

function createContext(user: {
  id: number;
  email: string;
  isWaitlisted: boolean;
  isAdmin: boolean;
  isBetaUser: boolean;
}) {
  return {
    headers: new Headers(),
    session: {
      user,
    },
  } as any;
}

describeIntegration("tRPC integration", () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetRedis();
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("runs protected procedure with persisted user context", async () => {
    const user = await createUser({
      email: "protected@example.com",
      isBetaUser: true,
      isWaitlisted: false,
    });

    const caller = createCaller(
      createContext({
        id: user.id,
        email: user.email as string,
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      }),
    );

    await expect(caller.protectedPing()).resolves.toEqual({ userId: user.id });
  });

  it("resolves team procedure from postgres team membership", async () => {
    const { user, team } = await createTeamWithUser(Role.ADMIN);

    const caller = createCaller(
      createContext({
        id: user.id,
        email: user.email as string,
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      }),
    );

    await expect(caller.teamPing()).resolves.toEqual({
      teamId: team.id,
      role: "ADMIN",
    });
  });

  it("fails team procedure when user has no team", async () => {
    const user = await createUser({
      email: "no-team@example.com",
      isBetaUser: true,
      isWaitlisted: false,
    });

    const caller = createCaller(
      createContext({
        id: user.id,
        email: user.email as string,
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      }),
    );

    const teamPingPromise = caller.teamPing();

    await expect(teamPingPromise).rejects.toBeInstanceOf(TRPCError);
    await expect(teamPingPromise).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
