import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: {
    NEXTAUTH_URL: "http://localhost:3000",
  },
}));

import { isUnsubscribeEngagementExemptLink } from "./unsubscribe-engagement-exempt";

describe("isUnsubscribeEngagementExemptLink", () => {
  it("exempts branded unsubscribe URLs on a different origin", () => {
    expect(
      isUnsubscribeEngagementExemptLink(
        "https://branded.example.com/unsubscribe",
      ),
    ).toBe(true);
  });

  it("exempts same-origin unsubscribe links", () => {
    expect(
      isUnsubscribeEngagementExemptLink(
        "http://localhost:3000/unsubscribe?token=1",
      ),
    ).toBe(true);
  });

  it("returns false when unsubscribe does not appear in path or query", () => {
    expect(
      isUnsubscribeEngagementExemptLink("https://other.example.com/pricing"),
    ).toBe(false);
  });

  it("matches relative /api/unsubscribe paths in the fallback branch", () => {
    expect(isUnsubscribeEngagementExemptLink("/api/unsubscribe?x=1")).toBe(
      true,
    );
  });
});
