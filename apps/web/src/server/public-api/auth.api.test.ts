import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockRedis } = vi.hoisted(() => ({
  mockDb: {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    team: {
      findUnique: vi.fn(),
    },
  },
  mockRedis: {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  },
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

vi.mock("~/utils/common", () => ({
  isSelfHosted: () => false,
}));

import { getApp } from "~/server/public-api/hono";

type FindUniqueArgs = { where?: { id?: number; clientId?: string } };

describe("public API auth middleware", () => {
  beforeEach(() => {
    // Prisma rejects a `where` with neither `id` nor `clientId` before the
    // query runs. The production logs carry this exact message.
    mockDb.apiKey.findUnique.mockImplementation((args: FindUniqueArgs) => {
      if (args.where?.id === undefined && args.where?.clientId === undefined) {
        throw new Error(
          "Argument `where` of type ApiKeyWhereUniqueInput needs at least one of `id` or `clientId` arguments.",
        );
      }
      return Promise.resolve(null);
    });
    mockDb.apiKey.update.mockResolvedValue({});
    mockDb.team.findUnique.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(1);
  });

  it("rejects a bearer token outside the useSend key shape with 403", async () => {
    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/api/v1/ping", {
      headers: { Authorization: "Bearer not-a-usesend-token" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "FORBIDDEN", message: "Invalid API token" },
    });
    expect(mockDb.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown but well-formed token with 403", async () => {
    const app = getApp();
    app.get("/v1/ping", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/api/v1/ping", {
      headers: { Authorization: `Bearer us_unknownclient_${"a".repeat(32)}` },
    });

    expect(response.status).toBe(403);
  });
});
