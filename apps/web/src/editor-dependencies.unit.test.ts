import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The email editor (Tiptap/ProseMirror) breaks if two copies of a ProseMirror
 * core package end up in the bundle: typing moves the cursor but no text is
 * added, and the browser logs "looks like multiple versions of prosemirror-model
 * were loaded". That happened from Oct 26 to Nov 16 2026, when an override bumped
 * prosemirror-view, whose copy of prosemirror-model then differed from @tiptap/pm's.
 *
 * If this fails after a dependency change, make every package below resolve to one
 * version, e.g. by upgrading @tiptap/* or adding a matching pnpm override.
 */
const SINGLE_COPY = ["prosemirror-model", "prosemirror-state", "prosemirror-transform", "prosemirror-view"];

function lockfileVersions(lockfile: string, name: string) {
  const packages = lockfile.slice(lockfile.indexOf("\npackages:\n"), lockfile.indexOf("\nsnapshots:\n"));
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = new RegExp(`^  '?${escaped}@([^:'(]+)'?:`, "gm");
  return [...packages.matchAll(pattern)].map((match) => match[1]);
}

describe("email editor dependencies", () => {
  const lockfile = readFileSync(resolve(__dirname, "../../../pnpm-lock.yaml"), "utf8");

  it.each(SINGLE_COPY)("installs exactly one version of %s", (name) => {
    expect(lockfileVersions(lockfile, name)).toHaveLength(1);
  });
});
