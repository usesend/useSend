import { describe, expect, it } from "vitest";
import {
  contactMatchesSegmentDefinition,
  describeContactSegmentDefinition,
  normalizeContactSegmentDefinition,
} from "~/lib/contact-segments";

describe("contact-segments", () => {
  it("normalizes condition fields to canonical variable names", () => {
    expect(
      normalizeContactSegmentDefinition(
        {
          conditions: [
            {
              field: "Plan",
              operator: "equals",
              value: "paid",
            },
          ],
        },
        ["plan", "lifecycleStage"],
      ),
    ).toEqual({
      conditions: [
        {
          field: "plan",
          operator: "equals",
          value: "paid",
        },
      ],
    });
  });

  it("matches contacts against equals and contains conditions", () => {
    expect(
      contactMatchesSegmentDefinition(
        {
          plan: "paid",
          lifecycleStage: "trial-ending",
        },
        {
          conditions: [
            {
              field: "plan",
              operator: "equals",
              value: "paid",
            },
            {
              field: "lifecycleStage",
              operator: "contains",
              value: "trial",
            },
          ],
        },
        ["plan", "lifecycleStage"],
      ),
    ).toBe(true);
  });

  it("describes the segment definition for the UI", () => {
    expect(
      describeContactSegmentDefinition({
        conditions: [
          {
            field: "plan",
            operator: "equals",
            value: "free",
          },
          {
            field: "company",
            operator: "isSet",
          },
        ],
      }),
    ).toBe('plan is "free" and company is set');
  });
});
