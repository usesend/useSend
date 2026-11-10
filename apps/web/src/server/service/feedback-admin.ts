import { FeedbackStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { db as defaultDb } from "~/server/db";
import { MailNotSentError, sendFeedbackReply } from "~/server/mailer";
import { isUniqueViolation } from "~/server/service/feedback-service";

/**
 * Reviewing and replying to feedback, for the internal admin API.
 */

export const FEEDBACK_LIST_MAX = 200;
export const FEEDBACK_IMPORT_MAX = 500;
const IMPORTED_MESSAGE_MAX = 50_000;
const REPLY_MAX = 20_000;
const IMPORT_OPEN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * useSend's API remembers an idempotency key for 24 hours. A reply still
 * unconfirmed after this long can't be retried safely by key alone: it may
 * have gone out, so it needs a person to check.
 */
export const REPLY_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export class FeedbackNotFoundError extends Error {}
export class IdempotencyConflictError extends Error {}
/** An unconfirmed reply too old to retry by key: check whether it arrived. */
export class ReplyNeedsCheckError extends Error {}
export { MailNotSentError };

export const listFeedbackQuery = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(FEEDBACK_LIST_MAX).default(50),
  cursor: z.string().min(1).optional(),
});

export const statusBody = z.object({ status: z.nativeEnum(FeedbackStatus) });

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

/**
 * Emails a reply to whoever sent the feedback and records it, at most once per
 * `idempotencyKey`.
 *
 * The reply is saved as SENDING, then sent through useSend's API with the
 * reply's id as the idempotency key, so retrying a reply that may or may not
 * have gone out returns the first send instead of sending again. On success
 * the reply is SENT and the feedback REPLIED; on failure it's FAILED and the
 * same key can be retried.
 */
export async function replyToFeedback(
  feedbackId: string,
  input: z.infer<typeof replyBody>,
  { db, send }: ReplyDeps = { db: defaultDb, send: sendFeedbackReply },
) {
  const feedback = await db.feedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw new FeedbackNotFoundError();

  let reply = await db.feedbackReply.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (!reply) {
    try {
      reply = await db.feedbackReply.create({
        data: {
          feedbackId,
          message: input.message,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (error) {
      // Another request with the same key saved it first.
      if (!isUniqueViolation(error, "idempotencyKey")) throw error;
      reply = await db.feedbackReply.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
      });
    }
  }

  // A key stands for one message: an edited reply needs a new key.
  if (reply.feedbackId !== feedbackId || reply.message !== input.message) {
    throw new IdempotencyConflictError();
  }
  if (reply.deliveryStatus === "SENT") {
    return { reply, sent: false };
  }
  if (
    reply.deliveryStatus === "SENDING" &&
    Date.now() - reply.createdAt.getTime() > REPLY_RETRY_WINDOW_MS
  ) {
    throw new ReplyNeedsCheckError();
  }

  const email = replyEmail(feedback.message, reply.message);
  try {
    await send({
      to: feedback.email,
      subject: email.subject,
      text: email.text,
      idempotencyKey: `feedback-reply:${reply.id}`,
    });
  } catch (error) {
    // Only from SENDING: a concurrent attempt that already succeeded wins.
    await db.feedbackReply.updateMany({
      where: { id: reply.id, deliveryStatus: "SENDING" },
      data: { deliveryStatus: "FAILED" },
    });
    throw error instanceof MailNotSentError
      ? error
      : new MailNotSentError("Sending the reply failed");
  }

  const [sent] = await db.$transaction([
    db.feedbackReply.update({
      where: { id: reply.id },
      data: { deliveryStatus: "SENT", sentAt: new Date() },
    }),
    db.feedback.update({
      where: { id: feedbackId },
      data: { status: "REPLIED" },
    }),
  ]);
  return { reply: sent, sent: true };
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
