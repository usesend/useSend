import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/mailer", () => ({ sendFeedbackNotification: vi.fn() }));
vi.mock("~/server/logger/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  FEEDBACK_RATE_LIMIT,
  submitFeedback,
} from "~/server/service/feedback-service";

const sender = { userId: 7, team: { id: 3, name: "Acme" } };
const KEY = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

function saved(overrides: Record<string, unknown> = {}) {
  return {
    id: "fb_1",
    userId: 7,
    message: "Love it",
    clientKey: KEY,
    ...overrides,
  };
}

function setup() {
  const tx = {
    $queryRaw: vi.fn(async () => [{ email: "a@acme.com", name: "Ana" }]),
    feedback: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: { data: object }) => ({
        id: "fb_new",
        ...data,
      })),
    },
  };
  const db = {
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    feedback: { findUnique: vi.fn() },
  };
  const notify = vi.fn(async () => undefined);
  return { tx, db, notify, deps: { db: db as any, notify } };
}

describe("submitFeedback", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("saves the feedback with the sender's details, then emails about it", async () => {
    const result = await submitFeedback(
      sender,
      { message: "  Love it  ", clientKey: KEY },
      ctx.deps,
    );

    expect(result).toEqual({ id: "fb_new", created: true });
    expect(ctx.tx.feedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 7,
        teamId: 3,
        teamName: "Acme",
        email: "a@acme.com",
        name: "Ana",
        message: "Love it",
        source: "web",
        clientKey: KEY,
      }),
    });
    expect(ctx.notify).toHaveBeenCalledTimes(1);
  });

  it("still saves it when the email fails", async () => {
    ctx.notify.mockRejectedValueOnce(new Error("smtp down"));

    await expect(
      submitFeedback(sender, { message: "Love it" }, ctx.deps),
    ).resolves.toEqual({ id: "fb_new", created: true });
  });

  it("returns the saved feedback for a retry of the same draft, without emailing again", async () => {
    ctx.tx.feedback.findUnique.mockResolvedValueOnce(saved() as any);

    const result = await submitFeedback(
      sender,
      { message: "Love it", clientKey: KEY },
      ctx.deps,
    );

    expect(result).toEqual({ id: "fb_1", created: false });
    expect(ctx.tx.feedback.create).not.toHaveBeenCalled();
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("refuses a draft key reused for different text", async () => {
    ctx.tx.feedback.findUnique.mockResolvedValueOnce(
      saved({ message: "Something else" }) as any,
    );

    await expect(
      submitFeedback(sender, { message: "Love it", clientKey: KEY }, ctx.deps),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("treats the same message from the same person within a day as a resend", async () => {
    ctx.tx.feedback.findFirst.mockResolvedValueOnce(
      saved({ clientKey: null }) as any,
    );

    const result = await submitFeedback(
      sender,
      { message: "Love it" },
      ctx.deps,
    );

    expect(result.created).toBe(false);
    expect(ctx.notify).not.toHaveBeenCalled();
  });

  it("refuses more than the hourly limit", async () => {
    ctx.tx.feedback.count.mockResolvedValueOnce(FEEDBACK_RATE_LIMIT.limit);

    await expect(
      submitFeedback(sender, { message: "Love it" }, ctx.deps),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("returns the other request's save when two submits with the same key race", async () => {
    ctx.db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "6",
        meta: { target: ["clientKey"] },
      }),
    );
    ctx.db.feedback.findUnique.mockResolvedValueOnce(saved());

    const result = await submitFeedback(
      sender,
      { message: "Love it", clientKey: KEY },
      ctx.deps,
    );

    expect(result).toEqual({ id: "fb_1", created: false });
    expect(ctx.notify).not.toHaveBeenCalled();
  });
});
