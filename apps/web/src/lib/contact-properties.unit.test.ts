import { describe, expect, it } from "vitest";
import {
  getContactPropertyValue,
  mergeContactPropertiesWithVariableValues,
  normalizePropertyHeader,
} from "~/lib/contact-properties";

describe("contact-properties", () => {
  it("reads property values case-insensitively", () => {
    const value = getContactPropertyValue(
      { Company: "Acme", plan: "pro" },
      "company",
    );

    expect(value).toBe("Acme");
  });

  it("normalizes CSV headers to registry variable casing", () => {
    const normalized = normalizePropertyHeader("Company", ["company", "plan"]);

    expect(normalized).toBe("company");
  });

  it("preserves non-registry properties while updating registry variables", () => {
    const merged = mergeContactPropertiesWithVariableValues({
      properties: {
        Company: "Acme",
        region: "EU",
        leadSource: "Webinar",
      },
      variableValues: {
        company: "Globex",
        region: "",
      },
      contactBookVariables: ["company", "region"],
    });

    expect(merged).toEqual({
      leadSource: "Webinar",
      company: "Globex",
    });
  });
});
