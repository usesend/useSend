import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Goes through the real usesend-js SDK with HTTP mocked, so the SDK's error
// shape is what's tested.
vi.mock("~/env", () => ({
  env: {
    UNSEND_API_KEY: "us_test",
    FOUNDER_EMAIL: "founder@usesend.com",
    NODE_ENV: "test",
  },
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/service/domain-service", () => ({ getDomains: vi.fn() }));
vi.mock("~/server/service/email-service", () => ({ sendEmail: vi.fn() }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/email-templates", () => ({
  renderOtpEmail: vi.fn(),
  renderTeamInviteEmail: vi.fn(),
}));

import {
  MailNotSentError,
  MailUncertainError,
  sendFeedbackReply,
} from "~/server/mailer";

const params = {
  to: "a@acme.com",
  subject: "Re: your feedback to useSend",
  text: "Thanks!",
  idempotencyKey: "feedback-reply:rep_1",
};

function respond(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("sendFeedbackReply through the SDK", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("sends with the idempotency key", async () => {
    const fetch = respond(200, { emailId: "em_1" });
    globalThis.fetch = fetch as any;

    await expect(sendFeedbackReply(params)).resolves.toEqual({
      emailId: "em_1",
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "feedback-reply:rep_1",
    );
  });

  it("knows a rate-limited send wasn't sent", async () => {
    globalThis.fetch = respond(429, {
      error: { code: "RATE_LIMITED", message: "Too many requests" },
    }) as any;

    await expect(sendFeedbackReply(params)).rejects.toBeInstanceOf(
      MailNotSentError,
    );
  });

  it("treats a server error as maybe sent", async () => {
    globalThis.fetch = respond(500, {
      error: { code: "INTERNAL_SERVER_ERROR", message: "boom" },
    }) as any;

    await expect(sendFeedbackReply(params)).rejects.toBeInstanceOf(
      MailUncertainError,
    );
  });

  it("treats an in-progress duplicate as maybe sent", async () => {
    globalThis.fetch = respond(409, {
      error: { code: "NOT_UNIQUE", message: "in progress" },
    }) as any;

    await expect(sendFeedbackReply(params)).rejects.toBeInstanceOf(
      MailUncertainError,
    );
  });

  it("treats a dropped connection as maybe sent", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as any;

    await expect(sendFeedbackReply(params)).rejects.toBeInstanceOf(
      MailUncertainError,
    );
  });
});
