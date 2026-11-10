import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/server/mailer", () => {
  class MailNotSentError extends Error {}
  class MailUncertainError extends Error {}
  return {
    MailNotSentError,
    MailUncertainError,
    sendFeedbackReply: vi.fn(),
    sendFeedbackNotification: vi.fn(),
  };
});

import {
  IdempotencyConflictError,
  MailNotSentError,
  MailUncertainError,
  ReplyInProgressError,
  ReplyNotSendingError,
  ReplyStillSendingError,
  SETTLE_AFTER_MS,
  importFeedback,
  replyToFeedback,
  settleReply,
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
    attemptId: "att_1",
    attemptStartedAt: new Date(),
    sentAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const db: any = {
    feedback: {
      findUnique: vi.fn(async () => feedback),
      update: vi.fn(async () => feedback),
    },
    feedbackReply: {
      findUnique: vi.fn(async () => null as unknown),
      findFirst: vi.fn(async () => null as unknown),
      findUniqueOrThrow: vi.fn(async () => reply({ deliveryStatus: "SENT" })),
      create: vi.fn(async () => reply()),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  db.$transaction = vi.fn(async (arg: unknown) =>
    typeof arg === "function"
      ? arg(db)
      : Promise.all(arg as Promise<unknown>[]),
  );
  const send = vi.fn(async () => ({ emailId: "em_1" }));
  return { db, send, deps: { db, send } };
}

const input = { message: "Thanks!", idempotencyKey: "key-123456" };

describe("replyToFeedback", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("claims the reply, emails it, then marks it sent by this attempt only", async () => {
    const result = await replyToFeedback("fb_1", input, ctx.deps);

    expect(ctx.send).toHaveBeenCalledWith({
      to: "a@acme.com",
      subject: "Re: your feedback to useSend",
      text: "Thanks!\n\nYou wrote:\n> Love it\n> Thanks",
      idempotencyKey: "feedback-reply:rep_1",
    });
    expect(result.sent).toBe(true);
    expect(ctx.db.feedbackReply.updateMany).toHaveBeenCalledWith({
      where: { id: "rep_1", attemptId: "att_1", deliveryStatus: "SENDING" },
      data: expect.objectContaining({ deliveryStatus: "SENT" }),
    });
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

  it("never resends a reply that's sending or may have been sent", async () => {
    ctx.db.feedbackReply.findUnique.mockResolvedValueOnce(reply());

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(ReplyInProgressError);
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("claims a failed reply again before retrying it", async () => {
    ctx.db.feedbackReply.findUnique.mockResolvedValueOnce(
      reply({ deliveryStatus: "FAILED" }),
    );

    await replyToFeedback("fb_1", input, ctx.deps);

    expect(ctx.db.feedbackReply.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "rep_1", deliveryStatus: "FAILED" },
      data: expect.objectContaining({ deliveryStatus: "SENDING" }),
    });
    expect(ctx.db.feedbackReply.create).not.toHaveBeenCalled();
    expect(ctx.send).toHaveBeenCalledTimes(1);
  });

  it("doesn't send when another request claimed the failed reply first", async () => {
    ctx.db.feedbackReply.findUnique.mockResolvedValue(
      reply({ deliveryStatus: "FAILED" }),
    );
    ctx.db.feedbackReply.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(ReplyInProgressError);
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

  it("marks the reply failed when it certainly wasn't sent", async () => {
    ctx.send.mockRejectedValueOnce(new MailNotSentError("RATE_LIMITED"));

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(MailNotSentError);
    expect(ctx.db.feedbackReply.updateMany).toHaveBeenCalledWith({
      where: { id: "rep_1", attemptId: "att_1", deliveryStatus: "SENDING" },
      data: { deliveryStatus: "FAILED" },
    });
    expect(ctx.db.feedback.update).not.toHaveBeenCalled();
  });

  it("leaves the reply sending when it may have gone out", async () => {
    ctx.send.mockRejectedValueOnce(new MailUncertainError("TypeError"));

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(MailUncertainError);
    expect(ctx.db.feedbackReply.updateMany).not.toHaveBeenCalled();
  });

  it("treats an unexpected error as possibly sent", async () => {
    ctx.send.mockRejectedValueOnce(new Error("boom"));

    await expect(
      replyToFeedback("fb_1", input, ctx.deps),
    ).rejects.toBeInstanceOf(MailUncertainError);
    expect(ctx.db.feedbackReply.updateMany).not.toHaveBeenCalled();
  });
});

describe("settleReply", () => {
  let ctx: ReturnType<typeof setup>;
  const old = () => new Date(Date.now() - SETTLE_AFTER_MS - 1000);
  beforeEach(() => {
    ctx = setup();
  });

  it("records a checked reply as sent", async () => {
    ctx.db.feedbackReply.findFirst.mockResolvedValueOnce(
      reply({ attemptStartedAt: old() }),
    );

    await settleReply("fb_1", "rep_1", "SENT", ctx.db);

    expect(ctx.db.feedbackReply.updateMany).toHaveBeenCalledWith({
      where: { id: "rep_1", deliveryStatus: "SENDING", attemptId: "att_1" },
      data: expect.objectContaining({ deliveryStatus: "SENT" }),
    });
    expect(ctx.db.feedback.update).toHaveBeenCalled();
  });

  it("lets a checked, unsent reply be sent again", async () => {
    ctx.db.feedbackReply.findFirst.mockResolvedValueOnce(
      reply({ attemptStartedAt: old() }),
    );

    await settleReply("fb_1", "rep_1", "FAILED", ctx.db);

    expect(ctx.db.feedbackReply.updateMany).toHaveBeenCalledWith({
      where: { id: "rep_1", deliveryStatus: "SENDING", attemptId: "att_1" },
      data: { deliveryStatus: "FAILED" },
    });
  });

  it("waits until the attempt is old enough", async () => {
    ctx.db.feedbackReply.findFirst.mockResolvedValueOnce(reply());

    await expect(
      settleReply("fb_1", "rep_1", "FAILED", ctx.db),
    ).rejects.toBeInstanceOf(ReplyStillSendingError);
  });

  it("only settles a reply that's still sending", async () => {
    ctx.db.feedbackReply.findFirst.mockResolvedValueOnce(
      reply({ deliveryStatus: "SENT", attemptStartedAt: old() }),
    );

    await expect(
      settleReply("fb_1", "rep_1", "FAILED", ctx.db),
    ).rejects.toBeInstanceOf(ReplyNotSendingError);
  });

  it("refuses when a newer attempt took the reply meanwhile", async () => {
    ctx.db.feedbackReply.findFirst.mockResolvedValueOnce(
      reply({ attemptStartedAt: old() }),
    );
    ctx.db.feedbackReply.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      settleReply("fb_1", "rep_1", "SENT", ctx.db),
    ).rejects.toBeInstanceOf(ReplyNotSendingError);
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
