import { EmailUsageType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCost,
  getUsageDate,
  getUsageTimestamp,
  getUsageUnits,
  TRANSACTIONAL_UNIT_CONVERSION,
} from "~/lib/usage";

describe("usage helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns yesterday date and timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T12:00:00.000Z"));

    expect(getUsageDate()).toBe("2026-02-07");
    expect(getUsageTimestamp()).toBe(
      Math.floor(new Date("2026-02-07T12:00:00.000Z").getTime() / 1000),
    );
  });

  it("converts transactional usage into billing units", () => {
    const units = getUsageUnits(100, 40);
    expect(units).toBe(100 + Math.floor(40 / TRANSACTIONAL_UNIT_CONVERSION));
  });

  it("calculates cost per email type", () => {
    expect(getCost(10, EmailUsageType.MARKETING)).toBe(0.01);
    expect(getCost(4, EmailUsageType.TRANSACTIONAL)).toBe(0.001);
  });
});
