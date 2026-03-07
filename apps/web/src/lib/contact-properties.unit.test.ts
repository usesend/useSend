import { describe, expect, it } from "vitest";
import {
  getContactPropertyValue,
  normalizeContactProperties,
  replaceContactVariableValues,
} from "~/lib/contact-properties";

describe("contact-properties", () => {
  it("normalizes registered property keys to the canonical variable casing", () => {
    expect(
      normalizeContactProperties(
        {
          Company: "Acme",
          tier: "gold",
          PlanName: "Pro",
        },
        ["company", "planName"],
      ),
    ).toEqual({
      company: "Acme",
      tier: "gold",
      planName: "Pro",
    });
  });

  it("reads property values case-insensitively for registered variables", () => {
    expect(
      getContactPropertyValue(
        {
          Company: "Acme",
        },
        "company",
        ["company"],
      ),
    ).toBe("Acme");
  });

  it("replaces registry-backed values while preserving unrelated properties", () => {
    expect(
      replaceContactVariableValues(
        {
          Company: "Old Co",
          tier: "gold",
          notes: "keep me",
        },
        {
          company: "New Co",
        },
        ["company", "plan"],
      ),
    ).toEqual({
      notes: "keep me",
      tier: "gold",
      company: "New Co",
    });
  });
});
