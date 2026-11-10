import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/mailer", () => {
  class MailNotSentError extends Error {}
  return {
    MailNotSentError,
    sendFeedbackReply: vi.fn(),
    sendFeedbackNotification: vi.fn(),
  };
});

import {
  IdempotencyConflictError,
  MailNotSentError,
  REPLY_RETRY_WINDOW_MS,
  ReplyNeedsCheckError,
  importFeedback,
  replyToFeedback,
} from "~/server/service/feedback-admin";

const feedback = {
  id: "fb_1",
  email: "a@acme.com",
  message: "Love it\nThanks",
};

function reply(overrides: Record<string, unknown> = {}) {
  return {
    id: "rep_1",
    feedbackId: "fb_1",
    message: "Thanks!",
    idempotencyKey: "key-123456",
    deliveryStatus: "SENDING",
    sentAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const db = {
    feedback: {
      findUnique: vi.fn(async () => feedback),
      update: vi.fn(async () => feedback),
    },
    feedbackReply: {
      findUnique: vi.fn(async () => null as unknown),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(async () => reply()),
      update: vi.fn(async () =>
        reply({ deliveryStatus: "SENT", sentAt: new Date() }),
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const send = vi.fn(async () => ({ emailId: "em_1" }));
  return { db, send, deps: { db: db as any, send } };
}

const input = { message: "Thanks!", idempotencyKey: "key-123456" };

describe("replyToFeedback", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("emails the reply with the reply's id as the idempotency key, then marks it sent", async () => {
    const result = await replyToFeedback("fb_1", input, ctx.deps);

    expect(ctx.send).toHaveBeenCalledWith({
      to: "a@acme.com",
      subject: "Re: your feedback to useSend",
      text: "Thanks!\n\nYou wrote:\n> Love it\n> Thanks",
      idempotencyKey: "feedback-reply:rep_1",
    });
    expect(result.sent).toBe(true);
    expect(ctx.db.feedback.update).toHaveBeenCalledWith({
      where: { id: "fb_1" },
      data: { status: "REPLIED" },
    });
  });

  it("doesn't send a reply that was already sent", async () => {
    ctx.db.feedbackReply.findUnique.mockResolvedValueOnce(
      reply({ deliveryStatus: "SENT" }),
    );

    const result = await replyToFeedback("fb_1", input, ctx.deps);

    expect(result.sent).toBe(false);
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("retries a failed or unconfirmed reply with the same idempotency key", async () => {
    ctx.db.feedbackReply.findUnique.mockResolvedValueOnce(
      reply({ deliveryStatus: "FAILED" }),
    );

    await replyToFeedback("fb_1", input, ctx.deps);

    expect(ctx.db.feedbackReply.create).not.toHaveBeenCalled();
    expect(ctx.send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "feedback-reply:rep_1" }),
    );
  });

  it("won't retry an unconfirmed reply older than the API remembers keys", async () => {
    ctx.db.feedbackReply.findUnique.mockResolvedValueOnce(
      reply({ createdAt: new Date(Date.now() - REPLY_RETRY_WINDOW_MS - 1000) }),
    );

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(ReplyNeedsCheckError);
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("refuses a key reused for a different message", async () => {
    ctx.db.feedbackReply.findUnique.mockResolvedValueOnce(
      reply({ message: "Something else" }),
    );

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("marks the reply failed, only if still sending, when the email isn't accepted", async () => {
    ctx.send.mockRejectedValueOnce(new MailNotSentError("rate limited"));

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(MailNotSentError);
    expect(ctx.db.feedbackReply.updateMany).toHaveBeenCalledWith({
      where: { id: "rep_1", deliveryStatus: "SENDING" },
      data: { deliveryStatus: "FAILED" },
    });
    expect(ctx.db.feedback.update).not.toHaveBeenCalled();
  });
});

describe("importFeedback", () => {
  it("stores feedback from known accounts and counts the rest", async () => {
    const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({
      count: data.length,
    }));
    const db = {
      user: {
        findMany: vi.fn(async () => [
          {
            id: 7,
            email: "a@acme.com",
            teamUsers: [{ team: { id: 3, name: "Acme" } }],
          },
        ]),
      },
      feedback: { createMany },
    };

    const result = await importFeedback(
      {
        items: [
          {
            externalId: "em_1",
            email: "A@acme.com",
            teamName: "Acme",
            message: "Old feedback",
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
          {
            externalId: "em_2",
            email: "nobody@else.com",
            message: "Who?",
            createdAt: new Date("2026-01-02T00:00:00Z"),
          },
        ],
      },
      db as any,
    );

    expect(result).toEqual({ created: 1, skipped: 0, unmatched: 1 });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          externalId: "em_1",
          userId: 7,
          teamId: 3,
          source: "import",
          status: "CLOSED",
        }),
      ],
      skipDuplicates: true,
    });
  });
});
