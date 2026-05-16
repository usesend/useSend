import { describe, expect, it } from "vitest";
import { addSesNoTrackToUnsubscribeLinks } from "~/server/utils/ses-tracking-html";

describe("addSesNoTrackToUnsubscribeLinks", () => {
  it("adds ses:no-track to anchors whose href contains unsubscribe", () => {
    const html =
      '<p><a href="https://app.example.com/api/unsubscribe?id=1&hash=x">Unsub</a></p>';
    const out = addSesNoTrackToUnsubscribeLinks(html);
    expect(out).toContain("ses:no-track");
    expect(out).toBe(
      '<p><a ses:no-track href="https://app.example.com/api/unsubscribe?id=1&hash=x">Unsub</a></p>',
    );
  });

  it("does not duplicate ses:no-track", () => {
    const html =
      '<a ses:no-track href="https://app.example.com/unsubscribe">x</a>';
    expect(addSesNoTrackToUnsubscribeLinks(html)).toBe(html);
  });

  it("leaves non-unsubscribe links unchanged", () => {
    const html = '<a href="https://example.com/">Home</a>';
    expect(addSesNoTrackToUnsubscribeLinks(html)).toBe(html);
  });

  it("handles mixed-case unsubscribe in href", () => {
    const html =
      '<a href="https://app.example.com/api/Unsubscribe?id=1">x</a>';
    const out = addSesNoTrackToUnsubscribeLinks(html);
    expect(out).toContain("ses:no-track");
  });
});
