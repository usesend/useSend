import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOUBLE_OPT_IN_CONTENT,
  getDefaultDoubleOptInContent,
} from "~/lib/constants/double-opt-in";

describe("double opt-in defaults", () => {
  it("uses a clickable link placeholder in the default editor content", () => {
    const content = JSON.parse(DEFAULT_DOUBLE_OPT_IN_CONTENT) as {
      content?: Array<{
        content?: Array<{
          marks?: Array<{ type?: string; attrs?: { href?: string } }>;
        }>;
      }>;
    };

    const hasLinkPlaceholder = content.content?.some((node) =>
      node.content?.some((child) =>
        child.marks?.some(
          (mark) =>
            mark.type === "link" && mark.attrs?.href === "{{doubleOptInUrl}}",
        ),
      ),
    );

    expect(hasLinkPlaceholder).toBe(true);
  });

  it("returns a clone when requesting default content", () => {
    const first = getDefaultDoubleOptInContent();
    const second = getDefaultDoubleOptInContent();

    first.content = [];

    expect(second.content).not.toEqual([]);
  });
});
