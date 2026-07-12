import { describe, expect, it } from "vitest";
import {
  getValidSesRegions,
  sesRegionSchema,
} from "~/lib/zod/ses-setting-schema";

describe("sesRegionSchema", () => {
  it("rejects empty regions", () => {
    expect(sesRegionSchema.safeParse("").success).toBe(false);
    expect(sesRegionSchema.safeParse("   ").success).toBe(false);
  });

  it("normalizes valid regions", () => {
    expect(sesRegionSchema.parse(" us-east-1 ")).toBe("us-east-1");
  });
});

describe("getValidSesRegions", () => {
  it("filters legacy empty regions and removes duplicates", () => {
    expect(
      getValidSesRegions(["", "  ", "us-east-1", " us-east-1 ", "eu-west-1"]),
    ).toEqual(["us-east-1", "eu-west-1"]);
  });
});
