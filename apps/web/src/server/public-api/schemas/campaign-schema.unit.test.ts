import { describe, expect, it } from "vitest";
import {
  campaignCreateSchema,
  campaignScheduleSchema,
} from "~/server/public-api/schemas/campaign-schema";

describe("campaign delivery API schemas", () => {
  it("accepts gradual delivery when creating a campaign", () => {
    const result = campaignCreateSchema.safeParse({
      name: "Product launch",
      from: "hello@example.com",
      subject: "We are live",
      contactBookId: "book_1",
      html: "<p>Hello</p>",
      delivery: {
        strategy: "gradual",
        batchPercentage: 10,
        interval: "hour",
      },
    });

    expect(result.success).toBe(true);
  });

  it.each([0, 51, 10.5])(
    "rejects an invalid gradual percentage of %s",
    (batchPercentage) => {
      const result = campaignScheduleSchema.safeParse({
        delivery: {
          strategy: "gradual",
          batchPercentage,
          interval: "minute",
        },
      });

      expect(result.success).toBe(false);
    },
  );

  it("accepts the all-at-once delivery strategy", () => {
    const result = campaignScheduleSchema.safeParse({
      delivery: { strategy: "all_at_once" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects gradual-only fields for all-at-once delivery", () => {
    const result = campaignScheduleSchema.safeParse({
      delivery: {
        strategy: "all_at_once",
        batchPercentage: 10,
        interval: "hour",
      },
    });

    expect(result.success).toBe(false);
  });
});
