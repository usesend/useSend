import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOUBLE_OPT_IN_CONTENT,
  getDefaultDoubleOptInContent,
  hasDoubleOptInUrlPlaceholder,
} from "~/lib/constants/double-opt-in";

describe("double opt-in defaults", () => {
  it("uses a confirmation button placeholder in the default editor content", () => {
    const content = JSON.parse(DEFAULT_DOUBLE_OPT_IN_CONTENT) as {
      content?: Array<{
        type?: string;
        attrs?: { url?: string };
      }>;
    };

    const hasButtonPlaceholder = content.content?.some(
      (node) =>
        node.type === "button" && node.attrs?.url === "{{doubleOptInUrl}}",
    );

    expect(hasButtonPlaceholder).toBe(true);
    expect(hasDoubleOptInUrlPlaceholder(DEFAULT_DOUBLE_OPT_IN_CONTENT)).toBe(
      true,
    );
  });

  it("returns a clone when requesting default content", () => {
    const first = getDefaultDoubleOptInContent();
    const second = getDefaultDoubleOptInContent();

    first.content = [];

    expect(second.content).not.toEqual([]);
  });

  it("detects placeholder tokens in raw string content", () => {
    expect(
      hasDoubleOptInUrlPlaceholder(
        '<p>Click <a href="{{ doubleOptInUrl }}">confirm</a></p>',
      ),
    ).toBe(true);
  });

  it("detects variable nodes using doubleOptInUrl", () => {
    expect(
      hasDoubleOptInUrlPlaceholder(
        JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "variable", attrs: { id: "doubleOptInUrl" } }],
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns false when placeholder is missing", () => {
    expect(
      hasDoubleOptInUrlPlaceholder(
        JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Confirm your subscription" }],
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});
