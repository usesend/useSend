import { describe, expect, it } from "vitest";
import { isEntitledSubscriptionStatus } from "~/lib/subscription-status";

describe("isEntitledSubscriptionStatus", () => {
  it("treats retrying subscriptions as entitled", () => {
    expect(isEntitledSubscriptionStatus("past_due")).toBe(true);
  });

  it("treats active and trialing subscriptions as entitled", () => {
    expect(isEntitledSubscriptionStatus("active")).toBe(true);
    expect(isEntitledSubscriptionStatus("trialing")).toBe(true);
  });

  it("treats exhausted or incomplete subscriptions as not entitled", () => {
    expect(isEntitledSubscriptionStatus("unpaid")).toBe(false);
    expect(isEntitledSubscriptionStatus("canceled")).toBe(false);
    expect(isEntitledSubscriptionStatus("incomplete")).toBe(false);
    expect(isEntitledSubscriptionStatus(null)).toBe(false);
  });
});
