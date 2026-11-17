import { Queue, Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import { subDays } from "date-fns";
import { db } from "~/server/db";
import { getRedis, BULL_PREFIX, redisKey } from "~/server/redis";
import { logger } from "../logger/log";
import { DEFAULT_QUEUE_OPTIONS } from "../queue/queue-constants";
import { env } from "~/env";
import { isEmailCleanupEnabled } from "~/utils/common";

/**
 * Clears the stored content (html, text, attachments, headers) of emails older
 * than EMAIL_CLEANUP_DAYS. Delivery status and events are kept. Runs wherever
 * EMAIL_CLEANUP_DAYS is set (self-hosted or cloud).
 *
 * Built for a large table on a nearly full disk:
 * - Walks forward by createdAt and remembers how far it got (a Redis
 *   watermark), so each night only reads emails it hasn't looked at yet.
 * - Clears at most MAX_ROWS_PER_RUN emails a night, in small batches, each a
 *   short transaction with lock and statement timeouts.
 * - Vacuums "Email" after a run, so the space it freed is reused the next night
 *   instead of the table growing. This doesn't shrink the files on disk.
 * - Never touches emails that are scheduled or queued, or whose scheduled time
 *   is after the cutoff: they still need their content to send.
 * - Doesn't change updatedAt (the campaign page sorts recent emails by it).
 */

const CLEANUP_QUEUE_NAME = "cleanup-email-bodies";
const CLEANUP_CRON = "0 0 * * *"; // midnight UTC

export const CLEANUP_LIMITS = {
  batchSize: 500,
  maxRowsPerRun: 100_000,
  maxRunMs: 15 * 60 * 1000,
  pauseMs: 200,
};
const BATCH_LOCK_TIMEOUT = "5s";
const BATCH_STATEMENT_TIMEOUT = "60s";
// Prisma's own interactive-transaction limit (default 5s) must sit above the
// SQL timeouts, or it would cut a slow batch off first.
const BATCH_TRANSACTION_OPTIONS = { timeout: 130_000, maxWait: 2_000 };

/** Emails created before this time have all been looked at. */
export const WATERMARK_KEY = "email-body-cleanup:cleaned-before";

type Position = { createdAt: Date; id: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Looks at the next batch of emails older than the cutoff, after `after`, and
 * clears the content of the ones that still have some.
 */
async function clearBatch(cutoff: Date, after: Position | null, size: number) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL lock_timeout = '${BATCH_LOCK_TIMEOUT}'`,
    );
    await tx.$executeRawUnsafe(
      `SET LOCAL statement_timeout = '${BATCH_STATEMENT_TIMEOUT}'`,
    );

    // Keyset over the createdAt index: no rescans of emails already looked at.
    const rows = await tx.$queryRaw<Position[]>`
      SELECT id, "createdAt" FROM "Email"
      WHERE "createdAt" < ${cutoff}
      ${
        after
          ? Prisma.sql`AND "createdAt" >= ${after.createdAt}
              AND ("createdAt" > ${after.createdAt} OR id > ${after.id})`
          : Prisma.empty
      }
      ORDER BY "createdAt" ASC, id ASC
      LIMIT ${size}
    `;

    if (rows.length === 0) return { looked: 0, cleared: 0, last: null };

    const cleared = await tx.$executeRaw`
      UPDATE "Email"
      SET html = NULL, text = NULL, attachments = NULL, headers = NULL
      WHERE id IN (${Prisma.join(rows.map((row) => row.id))})
        AND "createdAt" < ${cutoff}
        AND ("scheduledAt" IS NULL OR "scheduledAt" < ${cutoff})
        AND "latestStatus" NOT IN ('SCHEDULED', 'QUEUED')
        AND (html IS NOT NULL OR text IS NOT NULL
             OR attachments IS NOT NULL OR headers IS NOT NULL)
    `;

    return { looked: rows.length, cleared, last: rows[rows.length - 1]! };
  }, BATCH_TRANSACTION_OPTIONS);
}

export async function clearOldEmailBodies({
  cutoff,
  startAfter,
  saveProgress,
  limits = CLEANUP_LIMITS,
  now = () => Date.now(),
}: {
  cutoff: Date;
  /** Where the last run stopped, if anywhere. */
  startAfter: Position | null;
  /** Called after every batch with how far this run has got. */
  saveProgress: (position: Position) => Promise<void>;
  limits?: typeof CLEANUP_LIMITS;
  now?: () => number;
}) {
  const startedAt = now();
  let position = startAfter;
  let looked = 0;
  let cleared = 0;
  let batches = 0;
  const result = (finished: boolean) => ({
    looked,
    cleared,
    batches,
    finished,
    elapsedMs: now() - startedAt,
  });

  for (;;) {
    if (
      batches > 0 &&
      (cleared >= limits.maxRowsPerRun || now() - startedAt >= limits.maxRunMs)
    ) {
      return result(false);
    }

    const batch = await clearBatch(cutoff, position, limits.batchSize);
    if (!batch.last) return result(true);

    looked += batch.looked;
    cleared += batch.cleared;
    batches += 1;
    position = batch.last;
    await saveProgress(position);

    if (batch.looked < limits.batchSize) return result(true);
    await sleep(limits.pauseMs);
  }
}

function parsePosition(raw: string | null): Position | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { createdAt: string; id: string };
    const createdAt = new Date(value.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !value.id) return null;
    return { createdAt, id: value.id };
  } catch {
    return null;
  }
}

if (isEmailCleanupEnabled()) {
  const cleanupDays = env.EMAIL_CLEANUP_DAYS!;
  const watermarkKey = redisKey(WATERMARK_KEY);

  const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, {
    connection: getRedis(),
    prefix: BULL_PREFIX,
    skipVersionCheck: true,
  });

  const worker = new Worker(
    CLEANUP_QUEUE_NAME,
    async () => {
      const redis = getRedis();
      const cutoff = subDays(new Date(), cleanupDays);
      const startAfter = parsePosition(await redis.get(watermarkKey));

      const result = await clearOldEmailBodies({
        cutoff,
        startAfter,
        saveProgress: async (position) => {
          await redis.set(watermarkKey, JSON.stringify(position));
        },
      });

      logger.info(
        {
          ...result,
          cutoff: cutoff.toISOString(),
          startedAfter: startAfter?.createdAt.toISOString() ?? null,
        },
        result.finished
          ? "[EmailCleanupJob]: Cleared old email content"
          : "[EmailCleanupJob]: Cleared old email content; more remains for the next run",
      );

      if (result.cleared > 0) {
        // Make the freed space reusable for tomorrow's batch. PARALLEL 0:
        // parallel vacuum needs more shared memory than small containers
        // have. TRUNCATE FALSE: avoids the brief exclusive lock at the end.
        try {
          await db.$executeRawUnsafe(
            'VACUUM (TRUNCATE FALSE, PARALLEL 0) "Email"',
          );
          logger.info("[EmailCleanupJob]: Vacuumed Email");
        } catch (err) {
          logger.warn({ err }, "[EmailCleanupJob]: Vacuum failed");
        }
      }
    },
    {
      connection: getRedis(),
      prefix: BULL_PREFIX,
      skipVersionCheck: true,
    },
  );

  await cleanupQueue.upsertJobScheduler(
    "scheduled-email-cleanup",
    { pattern: CLEANUP_CRON, tz: "UTC" },
    { opts: { ...DEFAULT_QUEUE_OPTIONS } },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[EmailCleanupJob]: Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "[EmailCleanupJob]: Job failed");
  });
}
