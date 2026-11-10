import {
  FeedbackStatus,
  type FeedbackReply,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { z } from "zod";

import { db as defaultDb } from "~/server/db";
import {
  MailNotSentError,
  MailUncertainError,
  sendFeedbackReply,
} from "~/server/mailer";
import { isUniqueViolation } from "~/server/service/feedback-service";

/**
 * Reviewing and replying to feedback, for the internal admin API.
 */

export const FEEDBACK_LIST_MAX = 200;
export const FEEDBACK_IMPORT_MAX = 500;
const IMPORTED_MESSAGE_MAX = 50_000;
const REPLY_MAX = 20_000;
const IMPORT_OPEN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Reserving a reply retries this often when another request changes it meanwhile. */
const RESERVE_ATTEMPTS = 3;

/**
 * A reply stuck in SENDING this long after its attempt started is treated as
 * abandoned, and an operator may settle it after checking whether it arrived.
 */
export const SETTLE_AFTER_MS = 10 * 60 * 1000;

export class FeedbackNotFoundError extends Error {}
export class IdempotencyConflictError extends Error {}
/** A reply with this key is being sent, or it's unknown whether it went. */
export class ReplyInProgressError extends Error {}
export class ReplyNotFoundError extends Error {}
/** Only a SENDING reply can be settled by hand. */
export class ReplyNotSendingError extends Error {}
/** Its send attempt started less than `SETTLE_AFTER_MS` ago. */
export class ReplyStillSendingError extends Error {}
export { MailNotSentError, MailUncertainError };

export const listFeedbackQuery = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(FEEDBACK_LIST_MAX).default(50),
  cursor: z.string().min(1).optional(),
});

export const statusBody = z.object({ status: z.nativeEnum(FeedbackStatus) });

export const settleReplyBody = z.object({
  deliveryStatus: z.enum(["SENT", "FAILED"]),
});

export const replyBody = z.object({
  message: z.string().trim().min(1).max(REPLY_MAX),
  /** One per reply. Sending again with the same key and message never sends twice. */
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const importBody = z.object({
  items: z
    .array(
      z.object({
        /** Unique per original feedback email, e.g. the email's id. */
        externalId: z.string().trim().min(1).max(200),
        email: z.string().trim().email(),
        name: z.string().trim().max(200).optional(),
        teamName: z.string().trim().max(200).optional(),
        message: z.string().trim().min(1).max(IMPORTED_MESSAGE_MAX),
        createdAt: z.coerce.date(),
      }),
    )
    .max(FEEDBACK_IMPORT_MAX),
});

const feedbackInclude = {
  replies: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      message: true,
      deliveryStatus: true,
      sentAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.FeedbackInclude;

type FeedbackWithReplies = Prisma.FeedbackGetPayload<{
  include: typeof feedbackInclude;
}>;

function toFeedbackJson(feedback: FeedbackWithReplies) {
  return {
    id: feedback.id,
    createdAt: feedback.createdAt.toISOString(),
    status: feedback.status,
    source: feedback.source,
    userId: feedback.userId,
    email: feedback.email,
    name: feedback.name,
    teamId: feedback.teamId,
    teamName: feedback.teamName,
    message: feedback.message,
    replies: feedback.replies.map((reply) => ({
      id: reply.id,
      message: reply.message,
      deliveryStatus: reply.deliveryStatus,
      sentAt: reply.sentAt?.toISOString() ?? null,
      createdAt: reply.createdAt.toISOString(),
    })),
  };
}

/** Newest first. Pass the previous page's `nextCursor` as `cursor` for the next page. */
export async function listFeedback(
  query: z.infer<typeof listFeedbackQuery>,
  db: PrismaClient = defaultDb,
) {
  const rows = await db.feedback.findMany({
    where: {
      status: query.status,
      createdAt: query.since ? { gte: query.since } : undefined,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: feedbackInclude,
  });
  const page = rows.slice(0, query.limit);
  return {
    items: page.map(toFeedbackJson),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  db: PrismaClient = defaultDb,
) {
  const { count } = await db.feedback.updateMany({
    where: { id },
    data: { status },
  });
  if (count === 0) throw new FeedbackNotFoundError();
  const feedback = await db.feedback.findUniqueOrThrow({
    where: { id },
    include: feedbackInclude,
  });
  return toFeedbackJson(feedback);
}

type ReplyDeps = { db: PrismaClient; send: typeof sendFeedbackReply };

/** A new attempt to send a reply: only the attempt holding a SENDING reply may complete it. */
const newAttempt = () => ({
  attemptId: randomUUID(),
  attemptStartedAt: new Date(),
});

function replyEmail(feedbackMessage: string, reply: string) {
  const quoted = feedbackMessage
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return {
    subject: "Re: your feedback to useSend",
    text: `${reply}\n\nYou wrote:\n${quoted}`,
  };
}

type Reservation =
  | { kind: "claimed"; reply: FeedbackReply }
  | { kind: "sent"; reply: FeedbackReply };

/**
 * Claims the reply with this key for sending, or finds that it was sent. Each
 * step is one atomic write (the unique key on insert, a conditional update
 * from FAILED), so only one attempt ever holds a reply in SENDING.
 */
async function reserveReply(
  db: PrismaClient,
  feedbackId: string,
  input: z.infer<typeof replyBody>,
): Promise<Reservation> {
  for (let i = 0; i < RESERVE_ATTEMPTS; i++) {
    const existing = await db.feedbackReply.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (!existing) {
      try {
        const reply = await db.feedbackReply.create({
          data: {
            feedbackId,
            message: input.message,
            idempotencyKey: input.idempotencyKey,
            ...newAttempt(),
          },
        });
        return { kind: "claimed", reply };
      } catch (error) {
        // Another request with the same key saved it first: look again.
        if (isUniqueViolation(error, "idempotencyKey")) continue;
        throw error;
      }
    }

    // A key stands for one message: an edited reply needs a new key.
    if (
      existing.feedbackId !== feedbackId ||
      existing.message !== input.message
    ) {
      throw new IdempotencyConflictError();
    }
    if (existing.deliveryStatus === "SENT") {
      return { kind: "sent", reply: existing };
    }
    if (existing.deliveryStatus === "SENDING") {
      throw new ReplyInProgressError();
    }

    // FAILED: it certainly wasn't sent, so claim it to send again.
    const attempt = newAttempt();
    const { count } = await db.feedbackReply.updateMany({
      where: { id: existing.id, deliveryStatus: "FAILED" },
      data: { deliveryStatus: "SENDING", ...attempt },
    });
    if (count === 1) {
      return {
        kind: "claimed",
        reply: { ...existing, deliveryStatus: "SENDING", ...attempt },
      };
    }
  }
  throw new ReplyInProgressError();
}

/**
 * Emails a reply to whoever sent the feedback and records it, at most once per
 * `idempotencyKey`.
 *
 * The reply is claimed as SENDING first, then sent outside any transaction.
 * Sent: the reply is SENT and the feedback REPLIED. Certainly not sent: it's
 * FAILED and the same key can be retried. Unknown (e.g. the connection
 * dropped): it stays SENDING and is never resent automatically; someone checks
 * whether it arrived and settles it with `settleReply`.
 */
export async function replyToFeedback(
  feedbackId: string,
  input: z.infer<typeof replyBody>,
  { db, send }: ReplyDeps = { db: defaultDb, send: sendFeedbackReply },
) {
  const feedback = await db.feedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw new FeedbackNotFoundError();

  const reservation = await reserveReply(db, feedbackId, input);
  if (reservation.kind === "sent") {
    return { reply: reservation.reply, sent: false };
  }
  const { reply } = reservation;
  // Only this attempt may record the outcome.
  const mine = {
    id: reply.id,
    attemptId: reply.attemptId,
    deliveryStatus: "SENDING" as const,
  };

  const email = replyEmail(feedback.message, reply.message);
  try {
    await send({
      to: feedback.email,
      subject: email.subject,
      text: email.text,
      idempotencyKey: `feedback-reply:${reply.id}`,
    });
  } catch (error) {
    if (error instanceof MailNotSentError) {
      await db.feedbackReply.updateMany({
        where: mine,
        data: { deliveryStatus: "FAILED" },
      });
      throw error;
    }
    // It may have gone out: leave it SENDING for a person to check.
    throw error instanceof MailUncertainError
      ? error
      : new MailUncertainError("Unknown");
  }

  const sentAt = new Date();
  await db.$transaction([
    db.feedbackReply.updateMany({
      where: mine,
      data: { deliveryStatus: "SENT", sentAt },
    }),
    db.feedback.update({
      where: { id: feedbackId },
      data: { status: "REPLIED" },
    }),
  ]);
  return {
    reply: { ...reply, deliveryStatus: "SENT" as const, sentAt },
    sent: true,
  };
}

/**
 * Settles a reply stuck in SENDING, after checking whether the email arrived:
 * SENT records it as sent, FAILED lets the same key be sent again. Never done
 * automatically, and only once its attempt is at least `SETTLE_AFTER_MS` old.
 */
export async function settleReply(
  feedbackId: string,
  replyId: string,
  deliveryStatus: "SENT" | "FAILED",
  db: PrismaClient = defaultDb,
) {
  const reply = await db.feedbackReply.findFirst({
    where: { id: replyId, feedbackId },
  });
  if (!reply) throw new ReplyNotFoundError();
  if (reply.deliveryStatus !== "SENDING") throw new ReplyNotSendingError();
  const startedAt = reply.attemptStartedAt ?? reply.createdAt;
  if (Date.now() - startedAt.getTime() < SETTLE_AFTER_MS) {
    throw new ReplyStillSendingError();
  }

  const where = {
    id: reply.id,
    deliveryStatus: "SENDING" as const,
    attemptId: reply.attemptId,
  };
  if (deliveryStatus === "SENT") {
    await db.$transaction(async (tx) => {
      const { count } = await tx.feedbackReply.updateMany({
        where,
        data: { deliveryStatus: "SENT", sentAt: new Date() },
      });
      if (count === 0) throw new ReplyNotSendingError();
      await tx.feedback.update({
        where: { id: feedbackId },
        data: { status: "REPLIED" },
      });
    });
  } else {
    const { count } = await db.feedbackReply.updateMany({
      where,
      data: { deliveryStatus: "FAILED" },
    });
    if (count === 0) throw new ReplyNotSendingError();
  }
  return db.feedbackReply.findUniqueOrThrow({ where: { id: reply.id } });
}

/**
 * Copies feedback from the old feedback emails. Only feedback from an existing
 * account is stored; the rest is counted as `unmatched`. Safe to run again:
 * items already imported (by `externalId`) are skipped.
 */
export async function importFeedback(
  input: z.infer<typeof importBody>,
  db: PrismaClient = defaultDb,
) {
  const emails = [
    ...new Set(input.items.map((item) => item.email.toLowerCase())),
  ];
  const users = await db.user.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      teamUsers: { select: { team: { select: { id: true, name: true } } } },
    },
  });
  const byEmail = new Map(
    users.map((user) => [user.email?.toLowerCase(), user]),
  );

  let unmatched = 0;
  const rows: Prisma.FeedbackCreateManyInput[] = [];
  for (const item of input.items) {
    const user = byEmail.get(item.email.toLowerCase());
    if (!user) {
      unmatched += 1;
      continue;
    }
    const team = user.teamUsers.find(
      (teamUser) => teamUser.team.name === item.teamName,
    )?.team;
    rows.push({
      externalId: item.externalId,
      userId: user.id,
      teamId: team?.id ?? null,
      teamName: item.teamName ?? team?.name ?? null,
      email: item.email,
      name: item.name ?? null,
      message: item.message,
      source: "import",
      // Old feedback was answered by email, if at all; only the last month's
      // stays open so it can still get a reply.
      status:
        Date.now() - item.createdAt.getTime() > IMPORT_OPEN_WINDOW_MS
          ? "CLOSED"
          : "OPEN",
      createdAt: item.createdAt,
    });
  }

  const { count } = await db.feedback.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return { created: count, skipped: rows.length - count, unmatched };
}
