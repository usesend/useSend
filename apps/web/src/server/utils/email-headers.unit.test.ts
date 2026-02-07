import { describe, expect, it } from "vitest";
import {
  buildHeaders,
  sanitizeCustomHeaders,
  sanitizeHeader,
} from "~/server/utils/email-headers";

describe("email header sanitization", () => {
  it("removes reserved and invalid headers", () => {
    expect(sanitizeHeader("x-usesend-email-id", "123")).toBeUndefined();
    expect(sanitizeHeader("X-Test", "ok\r\nInjected: true")).toBeUndefined();
    expect(sanitizeHeader(123, "ok")).toBeUndefined();
  });

  it("returns undefined for empty sanitized map", () => {
    const result = sanitizeCustomHeaders({
      "x-usesend-email-id": "blocked",
      "x-bad": "hello\nworld",
    });

    expect(result).toBeUndefined();
  });

  it("adds defaults and keeps valid custom headers", () => {
    const headers = buildHeaders({
      emailId: "em_1",
      headers: {
        "X-Custom-Trace": "trace-1",
      },
      unsubUrl: "https://example.com/unsub",
      isBulk: true,
    });

    expect(headers["X-Usesend-Email-ID"]).toBe("em_1");
    expect(headers["X-Custom-Trace"]).toBe("trace-1");
    expect(headers["List-Unsubscribe"]).toBe("<https://example.com/unsub>");
    expect(headers["Precedence"]).toBe("bulk");
    expect(headers["X-Entity-Ref-ID"]).toBeTypeOf("string");
  });
});
