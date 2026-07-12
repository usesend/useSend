import { describe, expect, it } from "vitest";

import { getAuthErrorMessage, INVITATION_REQUIRED_MESSAGE } from "./auth-error";

describe("getAuthErrorMessage", () => {
  it("returns the invitation message for denied sign-ins", () => {
    expect(getAuthErrorMessage("AccessDenied")).toBe(
      INVITATION_REQUIRED_MESSAGE,
    );
  });

  it("returns a generic message for other authentication failures", () => {
    expect(getAuthErrorMessage("Verification")).toBe(
      "Unable to sign in. Please try again.",
    );
  });

  it("returns no message when there is no error", () => {
    expect(getAuthErrorMessage()).toBeNull();
  });
});
