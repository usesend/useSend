import { describe, expect, it } from "vitest";

import { isAdminAuthorized } from "~/server/admin-auth";

const TOKEN = "a".repeat(40);

describe("isAdminAuthorized", () => {
  it("accepts the right bearer token", () => {
    expect(isAdminAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isAdminAuthorized(`bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("refuses a wrong, missing or malformed token", () => {
    expect(isAdminAuthorized(`Bearer ${"b".repeat(40)}`, TOKEN)).toBe(false);
    expect(isAdminAuthorized(`Bearer ${TOKEN.slice(1)}`, TOKEN)).toBe(false);
    expect(isAdminAuthorized(TOKEN, TOKEN)).toBe(false);
    expect(isAdminAuthorized(null, TOKEN)).toBe(false);
    expect(isAdminAuthorized("Bearer ", TOKEN)).toBe(false);
  });

  it("refuses everything when no token is configured", () => {
    expect(isAdminAuthorized("Bearer ", undefined)).toBe(false);
    expect(isAdminAuthorized(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(isAdminAuthorized(`Bearer ${TOKEN}`, "")).toBe(false);
  });
});
