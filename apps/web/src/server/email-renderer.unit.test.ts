import { describe, expect, it, vi } from "vitest";

// jsx-email's logger binds console.warn when it is created, so record calls
// before the renderer (and jsx-email) is imported.
const warnings = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    calls.push(args);
    originalWarn(...args);
  };
  return calls;
});

import { EmailRenderer } from "@usesend/email-editor/src/renderer";

const buttonDoc = {
  type: "doc",
  content: [
    {
      type: "button",
      attrs: {
        text: "Click me",
        url: "https://example.com",
        buttonColor: "#000000",
        textColor: "#ffffff",
        borderRadius: "4",
        borderColor: "#000000",
        borderWidth: "1",
        alignment: "center",
      },
    },
  ],
};

describe("EmailRenderer button", () => {
  it("renders the button markup unchanged", async () => {
    const html = await new EmailRenderer(buttonDoc).render();

    expect(html).toContain(
      `<a href="https://example.com" style="color:#ffffff;background-color:#000000;border-color:#000000;border-width:1;border-style:solid;text-decoration:none;font-size:14px;font-weight:500;border-radius:4px;display:inline-block;line-height:100%;max-width:100%;padding:12px 34px 12px 34px"><span><!--[if mso]><i style="letter-spacing: 34px;mso-font-width:-100%;mso-text-raise: 18;" hidden>&nbsp;</i><![endif]--></span><span style="display:inline-block;line-height:120%;max-width:100%;mso-padding-alt:0px;mso-text-raise:9px">Click me</span><span><!--[if mso]><i style="letter-spacing: 34px;mso-font-width:-100%" hidden>&nbsp;</i><![endif]--></span></a>`,
    );
  });

  it("does not log a deprecation warning when rendering a button", async () => {
    warnings.length = 0;

    await new EmailRenderer(buttonDoc).render();

    expect(warnings).toEqual([]);
  });
});
