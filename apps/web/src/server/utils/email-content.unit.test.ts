import { describe, expect, it } from "vitest";
import { escapeHtml, toPlainHtml } from "~/server/utils/email-content";

describe("email-content utils", () => {
  it("escapes unsafe HTML characters", () => {
    const value = `<script>alert('x') & \"y\"</script>`;
    expect(escapeHtml(value)).toBe(
      "&lt;script&gt;alert(&#39;x&#39;) &amp; &quot;y&quot;&lt;/script&gt;",
    );
  });

  it("wraps plain text into preformatted safe html", () => {
    const result = toPlainHtml("Line 1\nLine <2>");
    expect(result).toContain("<pre");
    expect(result).toContain("Line 1");
    expect(result).toContain("Line &lt;2&gt;");
  });
});
