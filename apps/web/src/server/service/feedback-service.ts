import { Prisma, type Feedback, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { db as defaultDb } from "~/server/db";
import { logger } from "~/server/logger/log";
import { sendFeedbackNotification } from "~/server/mailer";

const HOUR_MS = 60 * 60 * 1000;

export const FEEDBACK_MAX_LENGTH = 2000;

/** The same message from the same person within this window is a resend, not new feedback. */
export const DUPLICATE_WINDOW_MS = 24 * HOUR_MS;
export const FEEDBACK_RATE_LIMIT = { limit: 10, windowMs: HOUR_MS };

export const submitFeedbackInput = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Feedback cannot be empty")
    .max(FEEDBACK_MAX_LENGTH),
  /** One per draft, so retrying the same draft never saves it twice. */
  clientKey: z.string().uuid().optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackInput>;

type Deps = {
  db: PrismaClient;
  notify: (feedback: Feedback) => Promise<unknown>;
};

const defaultDeps: Deps = { db: defaultDb, notify: sendFeedbackNotification };

export function isUniqueViolation(error: unknown, field: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta?.target ?? "").includes(field)
  );
}

const keyConflict = () =>
  new TRPCError({ code: "CONFLICT", message: "Feedback key already used" });

/**
 * The feedback this submission repeats, if any: the same draft (`clientKey`)
 * with the same text, or the same message from the same person within a day.
 */
async function findExisting(
  tx: Prisma.TransactionClient,
  userId: number,
  message: string,
  clientKey: string | undefined,
  now: Date,
) {
  if (clientKey) {
    const byKey = await tx.feedback.findUnique({ where: { clientKey } });
    if (byKey) {
      // Someone else's key, or the same draft edited after a failed send:
      // never report text as saved when it wasn't.
      if (byKey.userId !== userId || byKey.message !== message) {
        throw keyConflict();
      }
      return byKey;
    }
  }

  return tx.feedback.findFirst({
    where: {
      userId,
      message,
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Saves feedback, then emails the founder about it without waiting, so a mail
 * failure never loses it. Resubmitting returns the saved feedback instead of
 * saving or emailing it again.
 */
export async function submitFeedback(
  sender: { userId: number; team: { id: number; name: string } },
  input: SubmitFeedbackInput,
  { db, notify }: Deps = defaultDeps,
): Promise<{ id: string; created: boolean }> {
  const message = input.message.trim();
  const now = new Date();

  let result: { feedback: Feedback; created: boolean };
  try {
    // Locking the sender's row makes their submissions one at a time, so two
    // quick resends can't both miss each other in the checks below. The email
    // and name come from the locked row, not the possibly stale session.
    result = await db.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<
        { email: string | null; name: string | null }[]
      >`SELECT email, name FROM "User" WHERE id = ${sender.userId} FOR UPDATE`;
      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Account not found",
        });
      }
      if (!user.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add an email address to send feedback",
        });
      }

      const existing = await findExisting(
        tx,
        sender.userId,
        message,
        input.clientKey,
        now,
      );
      if (existing) {
        return { feedback: existing, created: false };
      }

      const recent = await tx.feedback.count({
        where: {
          userId: sender.userId,
          createdAt: {
            gte: new Date(now.getTime() - FEEDBACK_RATE_LIMIT.windowMs),
          },
        },
      });
      if (recent >= FEEDBACK_RATE_LIMIT.limit) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too much feedback at once. Try again in an hour.",
        });
      }

      const feedback = await tx.feedback.create({
        data: {
          userId: sender.userId,
          teamId: sender.team.id,
          teamName: sender.team.name,
          email: user.email,
          name: user.name,
          message,
          source: "web",
          clientKey: input.clientKey ?? null,
        },
      });
      return { feedback, created: true };
    });
  } catch (error) {
    // Two requests with the same key raced past each other: the other one saved it.
    if (!input.clientKey || !isUniqueViolation(error, "clientKey")) {
      throw error;
    }
    const existing = await db.feedback.findUnique({
      where: { clientKey: input.clientKey },
    });
    if (existing?.userId !== sender.userId || existing.message !== message) {
      throw keyConflict();
    }
    result = { feedback: existing, created: false };
  }

  const { feedback, created } = result;
  if (created) {
    notify(feedback).catch((error: unknown) =>
      logger.error(
        {
          feedbackId: feedback.id,
          err: error instanceof Error ? error.name : typeof error,
        },
        "[Feedback]: Failed to email feedback",
      ),
    );
  }

  return { id: feedback.id, created };
}
