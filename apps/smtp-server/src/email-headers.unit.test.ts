import { describe, expect, it } from "vitest";
import { simpleParser } from "mailparser";
import { extractForwardedHeaders } from "./email-headers";

describe("extractForwardedHeaders", () => {
  it("forwards end-to-end and custom headers", async () => {
    const parsed = await simpleParser(
      [
        "From: sender@example.com",
        "To: recipient@example.com",
        "Subject: Header forwarding",
        "List-Unsubscribe: <mailto:unsubscribe@example.com>,",
        " <https://example.com/unsubscribe/recipient-token>",
        "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
        "List-Help: <https://example.com/help>",
        "In-Reply-To: <previous@example.com>",
        "References: <first@example.com> <previous@example.com>",
        "Precedence: bulk",
        "Auto-Submitted: auto-generated",
        "Feedback-ID: campaign:customer:usesend",
        "X-Custom-Trace: trace-123",
        "",
        "Hello",
      ].join("\r\n"),
    );

    expect(extractForwardedHeaders(parsed.headerLines)).toEqual({
      "List-Unsubscribe":
        "<mailto:unsubscribe@example.com>, <https://example.com/unsubscribe/recipient-token>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "List-Help": "<https://example.com/help>",
      "In-Reply-To": "<previous@example.com>",
      References: "<first@example.com> <previous@example.com>",
      Precedence: "bulk",
      "Auto-Submitted": "auto-generated",
      "Feedback-ID": "campaign:customer:usesend",
      "X-Custom-Trace": "trace-123",
    });
  });

  it("does not forward headers that are rebuilt or transport-controlled", async () => {
    const parsed = await simpleParser(
      [
        "Return-Path: <bounce@example.com>",
        "Received: from untrusted.example.com",
        "Authentication-Results: mx.example.com; dkim=pass",
        "ARC-Seal: i=1; a=rsa-sha256; d=example.com; b=stale",
        "DKIM-Signature: v=1; d=example.com; b=stale",
        "X-SES-CONFIGURATION-SET: untrusted",
        "X-Usesend-Email-ID: spoofed",
        "From: sender@example.com",
        "To: recipient@example.com",
        "Cc: copy@example.com",
        "Bcc: hidden@example.com",
        "Subject: Header forwarding",
        "Message-ID: <old@example.com>",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "X-Safe: forwarded",
        "",
        "Hello",
      ].join("\r\n"),
    );

    expect(extractForwardedHeaders(parsed.headerLines)).toEqual({
      "X-Safe": "forwarded",
    });
  });

  it("returns undefined when there is nothing safe to forward", async () => {
    const parsed = await simpleParser(
      [
        "From: sender@example.com",
        "To: recipient@example.com",
        "Subject: Header forwarding",
        "",
        "Hello",
      ].join("\r\n"),
    );

    expect(extractForwardedHeaders(parsed.headerLines)).toBeUndefined();
  });
});
