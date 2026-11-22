import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisStore, mockRedisSet, mockRedisDel } = vi.hoisted(() => {
  const redisStore = new Set<string>();
  return {
    redisStore,
    mockRedisSet: vi.fn(async (key: string) => {
      if (redisStore.has(key)) return null;
      redisStore.add(key);
      return "OK";
    }),
    mockRedisDel: vi.fn(async (key: string) => redisStore.delete(key)),
  };
});

vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/redis", () => ({
  redisKey: (key: string) => key,
  getRedis: () => ({ set: mockRedisSet, del: mockRedisDel }),
}));

import {
  claimOutcome,
  releaseOutcome,
} from "~/server/service/ses-outcome-claims";

describe("SES outcome claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
  });

  it("claims each outcome once per email", async () => {
    await expect(claimOutcome("email_1", "complained")).resolves.toBe(
      "claimed",
    );
    await expect(claimOutcome("email_1", "complained")).resolves.toBe(
      "duplicate",
    );
    await expect(claimOutcome("email_1", "hardBounced")).resolves.toBe(
      "claimed",
    );
  });

  it("can claim again after a release", async () => {
    await claimOutcome("email_1", "hardBounced");
    await releaseOutcome("email_1", "hardBounced");

    await expect(claimOutcome("email_1", "hardBounced")).resolves.toBe(
      "claimed",
    );
  });

  it("reports when Redis can't check for duplicates", async () => {
    mockRedisSet.mockRejectedValueOnce(new Error("redis down"));

    await expect(claimOutcome("email_2", "complained")).resolves.toBe(
      "unavailable",
    );
  });
});
