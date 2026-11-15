import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  scheduler: undefined as { id: string; repeat: unknown } | undefined,
}));

vi.mock("bullmq", () => ({
  Queue: function () {
    return {
      upsertJobScheduler: (id: string, repeat: unknown) => {
        captured.scheduler = { id, repeat };
      },
    };
  },
  Worker: function () {
    return { on: () => {} };
  },
}));

vi.mock("~/server/db", () => ({ db: { team: { findMany: async () => [] } } }));

vi.mock("~/server/redis", () => ({
  BULL_PREFIX: "bull",
  getRedis: () => ({}),
}));

vi.mock("~/env", () => ({ env: {} }));

vi.mock("~/server/logger/log", () => ({
  logger: { info: () => {}, error: () => {} },
}));

vi.mock("~/server/billing/usage", () => ({ sendUsageToStripe: async () => {} }));

import "~/server/jobs/usage-job";

describe("usage reporting job schedule", () => {
  it("schedules the usage report once per day", () => {
    expect(captured.scheduler?.id).toBe("daily-usage-report");
    expect(captured.scheduler?.repeat).toEqual({
      pattern: "0 0 * * *",
      tz: "UTC",
    });
  });
});
