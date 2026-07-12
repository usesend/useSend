import { describe, expect, it } from "vitest";

import {
  GENERIC_AUTH_ERROR_MESSAGE,
  getAuthErrorMessage,
  INVITATION_REQUIRED_MESSAGE,
} from "./auth-error";

describe("getAuthErrorMessage", () => {
  it("returns the invitation message for denied sign-ins", () => {
    expect(getAuthErrorMessage("AccessDenied")).toBe(
      INVITATION_REQUIRED_MESSAGE,
    );
  });

  it("returns a generic message for other authentication failures", () => {
    expect(getAuthErrorMessage("Verification")).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
  });

  it("returns no message when there is no error", () => {
    expect(getAuthErrorMessage()).toBeNull();
  });
});
