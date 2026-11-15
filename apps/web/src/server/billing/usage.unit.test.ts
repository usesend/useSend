import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  events: [] as Array<{
    event_name?: string;
    identifier?: string;
    payload?: unknown;
    timestamp?: number;
  }>,
}));

vi.mock("stripe", () => ({
  default: function () {
    return {
      billing: {
        meterEvents: {
          create: async (params: unknown) => {
            captured.events.push(params as (typeof captured.events)[number]);
            return { id: "evt_1" };
          },
        },
      },
    };
  },
}));

vi.mock("~/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test_dummy" } }));

import { sendUsageToStripe } from "~/server/billing/usage";

describe("sendUsageToStripe", () => {
  afterEach(() => {
    captured.events = [];
    vi.useRealTimers();
  });

  it("reports the day's total under an identifier for that day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T12:00:00.000Z"));

    await sendUsageToStripe("cus_123", 42);

    expect(captured.events).toHaveLength(1);
    const params = captured.events[0]!;
    expect(params.identifier).toBe("unsend_usage_cus_123_2026-02-07");
    expect(params.payload).toEqual({
      value: "42",
      stripe_customer_id: "cus_123",
    });
  });

  it("uses the same identifier when the same day's report repeats", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-02-08T00:00:00.000Z"));
    await sendUsageToStripe("cus_123", 10);

    vi.setSystemTime(new Date("2026-02-08T12:00:00.000Z"));
    await sendUsageToStripe("cus_123", 12);

    expect(captured.events).toHaveLength(2);
    expect(captured.events[1]!.identifier).toBe(captured.events[0]!.identifier);
  });
});
