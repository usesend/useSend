import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv, store, mockRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockEnv: { NEXT_PUBLIC_IS_CLOUD: true },
    store,
    mockRedis: {
      set: vi.fn(async (key: string, value: string, ..._args: unknown[]) => {
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      }),
      eval: vi.fn(
        async (script: string, _n: number, key: string, token: string, ..._rest: string[]) => {
          if (store.get(key) !== token) return 0;
          if (script.includes("pexpire")) return 1;
          store.delete(key);
          return 1;
        },
      ),
    },
  };
});

vi.mock("~/env", () => ({ env: mockEnv }));
vi.mock("~/server/logger/log", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/redis", () => ({
  getRedis: () => mockRedis,
  redisKey: (key: string) => key,
}));

import { withPlanLimitLock } from "~/server/service/plan-limit-lock";

describe("withPlanLimitLock", () => {
  beforeEach(() => {
    store.clear();
    mockEnv.NEXT_PUBLIC_IS_CLOUD = true;
    vi.clearAllMocks();
  });

  it("runs concurrent creates for the same team one at a time", async () => {
    let created = 0;
    const limit = 1;
    const attempt = () =>
      withPlanLimitLock(1, "contactBook", async () => {
        const count = created; // the limit check
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (count >= limit) throw new Error("limit reached");
        created += 1; // the create
      });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, attempt),
    );

    expect(created).toBe(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(store.size).toBe(0);
  });

  it("releases the lock when the create fails", async () => {
    await expect(
      withPlanLimitLock(1, "domain", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(store.size).toBe(0);

    await expect(withPlanLimitLock(1, "domain", async () => "ok")).resolves.toBe(
      "ok",
    );
  });

  it("does not block other teams or resources", async () => {
    store.set("plan-limit-lock:domain:1", "someone-else");

    await expect(withPlanLimitLock(2, "domain", async () => "ok")).resolves.toBe("ok");
    await expect(withPlanLimitLock(1, "webhook", async () => "ok")).resolves.toBe("ok");
  });

  it("keeps renewing the lock while slow work is still running", async () => {
    vi.useFakeTimers();
    try {
      let finish: () => void = () => {};
      const work = withPlanLimitLock(1, "domain", () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      await vi.advanceTimersByTimeAsync(35_000);

      const renewals = mockRedis.eval.mock.calls.filter(([script]) =>
        String(script).includes("pexpire"),
      );
      expect(renewals.length).toBeGreaterThanOrEqual(3);
      expect((renewals[0] as unknown[])[4]).toBe("30000");

      finish();
      await work;
      await vi.advanceTimersByTimeAsync(0);
      expect(store.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the lock on self-hosted, where plan limits don't apply", async () => {
    mockEnv.NEXT_PUBLIC_IS_CLOUD = false;

    await expect(withPlanLimitLock(1, "domain", async () => "ok")).resolves.toBe("ok");
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
