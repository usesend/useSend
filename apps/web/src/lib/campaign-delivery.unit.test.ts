import { describe, expect, it } from "vitest";
import { calculateGradualDelivery } from "~/lib/campaign-delivery";

describe("calculateGradualDelivery", () => {
  const startsAt = new Date("2026-07-21T09:00:00.000Z");

  it("calculates percentage-based batches and completion from the first wave", () => {
    const result = calculateGradualDelivery({
      audienceSize: 50_000,
      batchPercentage: 10,
      intervalMinutes: 60,
      startsAt,
    });

    expect(result).toEqual({
      batchSize: 5_000,
      totalBatches: 10,
      durationMinutes: 540,
      completesAt: new Date("2026-07-21T18:00:00.000Z"),
    });
  });

  it("rounds the batch size up and leaves the remainder for the final batch", () => {
    const result = calculateGradualDelivery({
      audienceSize: 3,
      batchPercentage: 50,
      intervalMinutes: 1,
      startsAt,
    });

    expect(result.batchSize).toBe(2);
    expect(result.totalBatches).toBe(2);
    expect(result.completesAt).toEqual(new Date("2026-07-21T09:01:00.000Z"));
  });

  it("returns an empty schedule for an empty audience", () => {
    const result = calculateGradualDelivery({
      audienceSize: 0,
      batchPercentage: 10,
      intervalMinutes: 60,
      startsAt,
    });

    expect(result.batchSize).toBe(0);
    expect(result.totalBatches).toBe(0);
    expect(result.completesAt).toEqual(startsAt);
  });

  it.each([0, 51, 10.5])("rejects an invalid percentage of %s", (value) => {
    expect(() =>
      calculateGradualDelivery({
        audienceSize: 100,
        batchPercentage: value,
        intervalMinutes: 60,
        startsAt,
      }),
    ).toThrow("Batch percentage must be between 1 and 50");
  });
});
