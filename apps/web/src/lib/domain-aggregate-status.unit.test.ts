import { describe, expect, it } from "vitest";
import { DomainStatus } from "@prisma/client";
import { aggregateDomainStatus } from "~/lib/domain-aggregate-status";

describe("aggregateDomainStatus", () => {
  it("returns SUCCESS only when identity, DKIM, and SPF are all SUCCESS", () => {
    expect(
      aggregateDomainStatus({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.SUCCESS,
        spfDetails: DomainStatus.SUCCESS,
      }),
    ).toBe(DomainStatus.SUCCESS);
  });

  it("returns the worst status across the three checks", () => {
    expect(
      aggregateDomainStatus({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.SUCCESS,
        spfDetails: DomainStatus.PENDING,
      }),
    ).toBe(DomainStatus.PENDING);
  });

  it("treats FAILED as worse than PENDING", () => {
    expect(
      aggregateDomainStatus({
        status: DomainStatus.SUCCESS,
        dkimStatus: DomainStatus.FAILED,
        spfDetails: DomainStatus.PENDING,
      }),
    ).toBe(DomainStatus.FAILED);
  });
});
