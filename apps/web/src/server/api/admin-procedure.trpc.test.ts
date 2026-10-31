import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, mockDb } = vi.hoisted(() => ({
  mockEnv: {
    NEXT_PUBLIC_IS_CLOUD: true,
    ADMIN_EMAIL: undefined as string | undefined,
  },
  mockDb: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("~/env", () => ({ env: mockEnv }));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/auth", () => ({
  getServerAuthSession: vi.fn(),
}));

import {
  adminProcedure,
  createCallerFactory,
  createTRPCRouter,
} from "~/server/api/trpc";

const testRouter = createTRPCRouter({
  adminPing: adminProcedure.query(({ ctx }) => ({
    userId: ctx.session.user.id,
  })),
});

const createCaller = createCallerFactory(testRouter);

function getContext(user: { id: number; email: string }) {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: {
        ...user,
        isWaitlisted: false,
        isAdmin: false,
        isBetaUser: true,
      },
    },
  } as any;
}

const owner = { id: 1, email: "owner@example.com" };
const member = { id: 2, email: "member@example.com" };

describe("adminProcedure", () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    mockEnv.ADMIN_EMAIL = undefined;
    mockDb.user.findFirst.mockResolvedValue({ id: owner.id });
  });

  it("rejects non-admin users on cloud", async () => {
    mockEnv.ADMIN_EMAIL = "admin@example.com";

    await expect(
      createCaller(getContext(owner)).adminPing(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects everyone on cloud when ADMIN_EMAIL is unset", async () => {
    await expect(
      createCaller(getContext(owner)).adminPing(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockDb.user.findFirst).not.toHaveBeenCalled();
  });

  it("allows the ADMIN_EMAIL user on cloud", async () => {
    mockEnv.ADMIN_EMAIL = "admin@example.com";

    await expect(
      createCaller(
        getContext({ id: 3, email: "admin@example.com" }),
      ).adminPing(),
    ).resolves.toEqual({ userId: 3 });
  });

  describe("self-hosted", () => {
    beforeEach(() => {
      mockEnv.NEXT_PUBLIC_IS_CLOUD = false;
    });

    it("rejects users other than the instance owner", async () => {
      await expect(
        createCaller(getContext(member)).adminPing(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("allows the first registered user when ADMIN_EMAIL is unset", async () => {
      await expect(
        createCaller(getContext(owner)).adminPing(),
      ).resolves.toEqual({ userId: owner.id });
      expect(mockDb.user.findFirst).toHaveBeenCalledWith({
        orderBy: { id: "asc" },
        select: { id: true },
      });
    });

    it("only allows the ADMIN_EMAIL user when it is set", async () => {
      mockEnv.ADMIN_EMAIL = member.email;

      await expect(
        createCaller(getContext(owner)).adminPing(),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        createCaller(getContext(member)).adminPing(),
      ).resolves.toEqual({ userId: member.id });
      expect(mockDb.user.findFirst).not.toHaveBeenCalled();
    });
  });
});
