import { Contact } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CONTACT_VARIABLES,
  replaceContactVariables,
} from "./contact-variable-replacement";

const baseContact = {
  id: "contact_1",
  firstName: "Benoît",
  lastName: "Durand",
  email: "benoit@example.com",
  subscribed: true,
  unsubscribeReason: null,
  properties: {
    username: "ben",
  },
  contactBookId: "book_1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} satisfies Contact;

describe("replaceContactVariables", () => {
  it("replaces built-in contact variables in a subject", () => {
    expect(
      replaceContactVariables("Hello {{firstName}}", baseContact, [
        ...BUILT_IN_CONTACT_VARIABLES,
      ]),
    ).toBe("Hello Benoît");
  });

  it("replaces registered custom variables with fallback syntax", () => {
    expect(
      replaceContactVariables(
        "Welcome, {{username,fallback=you}}!",
        baseContact,
        [...BUILT_IN_CONTACT_VARIABLES, "username"],
      ),
    ).toBe("Welcome, ben!");
  });

  it("uses fallback values and accepts whitespace around fallback", () => {
    expect(
      replaceContactVariables(
        "Welcome, {{missing_variable, fallback=you}}!",
        baseContact,
        [...BUILT_IN_CONTACT_VARIABLES, "missing_variable"],
      ),
    ).toBe("Welcome, you!");
  });

  it("keeps unknown variables unchanged", () => {
    expect(
      replaceContactVariables("Hello {{unknown}}", baseContact, [
        ...BUILT_IN_CONTACT_VARIABLES,
      ]),
    ).toBe("Hello {{unknown}}");
  });
});
