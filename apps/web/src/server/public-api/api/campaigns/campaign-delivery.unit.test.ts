import { describe, expect, it } from "vitest";
import { toServiceDelivery } from "~/server/public-api/api/campaigns/campaign-delivery";

describe("toServiceDelivery", () => {
  it("maps public delivery strategies to service inputs", () => {
    expect(toServiceDelivery(undefined)).toBeUndefined();
    expect(toServiceDelivery({ strategy: "all_at_once" })).toEqual({
      strategy: "ALL_AT_ONCE",
    });
    expect(
      toServiceDelivery({
        strategy: "gradual",
        batchPercentage: 10,
        interval: "hour",
      }),
    ).toEqual({
      strategy: "GRADUAL",
      batchPercentage: 10,
      interval: "hour",
    });
  });
});
