import { Queue, Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { getRedis, BULL_PREFIX, redisKey } from "~/server/redis";
import { logger } from "../logger/log";
import { DEFAULT_QUEUE_OPTIONS } from "../queue/queue-constants";
import { env } from "~/env";
import { isEmailCleanupEnabled } from "~/utils/common";

/**
 * Clears the stored content (html, text, attachments, headers) of emails sent
 * more than EMAIL_CLEANUP_DAYS ago. Delivery status and events are kept. Runs
 * wherever EMAIL_CLEANUP_DAYS is set (self-hosted or cloud).
 *
 * "Sent more than N days ago" means created AND last updated before the
 * cutoff. Sending updates the email (Prisma sets updatedAt), so an email that
 * waited in a queue is kept for N days after it went out. SES status updates
 * use raw SQL and don't touch updatedAt, so they don't delay clearing.
 * Scheduled and queued emails, and ones scheduled after the cutoff, are never
 * cleared: they still need their content to send.
 *
 * Built for a large table on a nearly full disk:
 * - Walks forward by createdAt and remembers how far it got, so each night
 *   reads only emails it hasn't looked at yet.
 * - Emails it looked at but couldn't clear yet go on a "pending" list that is
 *   checked again (by id) on later nights.
 * - Clears at most MAX_ROWS_PER_RUN a night, in small batches, each a short
 *   transaction with lock and statement timeouts.
 * - Leaves vacuuming to autovacuum, which is tuned for "Email" in a migration
 *   so it runs after each night's changes and the freed space is reused.
 * - Doesn't change updatedAt (the campaign page sorts recent emails by it).
 */

const CLEANUP_QUEUE_NAME = "cleanup-email-bodies";
const CLEANUP_CRON = "0 0 * * *"; // midnight UTC
const DAY_MS = 24 * 60 * 60 * 1000;

export const CLEANUP_LIMITS = {
  batchSize: 500,
  maxRowsPerRun: 100_000,
  maxRunMs: 15 * 60 * 1000,
  pauseMs: 200,
  maxPendingPerRun: 5_000,
};
const BATCH_LOCK_TIMEOUT = "5s";
const BATCH_STATEMENT_TIMEOUT = "60s";
// Prisma's own interactive-transaction limit (default 5s) must sit above the
// SQL timeouts, or it would cut a slow batch off first.
const BATCH_TRANSACTION_OPTIONS = { timeout: 130_000, maxWait: 2_000 };

/** Emails created before this position have all been looked at. */
export const WATERMARK_KEY = "email-body-cleanup:cleaned-before";
/** Ids of emails looked at but not clearable yet. */
export const PENDING_KEY = "email-body-cleanup:pending";

export type Position = { createdAt: Date; id: string };

export type PendingStore = {
  list: (limit: number) => Promise<string[]>;
  add: (ids: string[]) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function retentionCutoff(days: number, now = Date.now()) {
  return new Date(now - days * DAY_MS);
}

type Tx = Prisma.TransactionClient;

async function withBatchTimeouts<T>(fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL lock_timeout = '${BATCH_LOCK_TIMEOUT}'`,
    );
    await tx.$executeRawUnsafe(
      `SET LOCAL statement_timeout = '${BATCH_STATEMENT_TIMEOUT}'`,
    );
    return fn(tx);
  }, BATCH_TRANSACTION_OPTIONS);
}

/**
 * Clears the content of the given emails if they're eligible, and returns how
 * many were cleared and which still have content (not eligible yet).
 */
async function clearEligible(tx: Tx, ids: string[], cutoff: Date) {
  const cleared = await tx.$executeRaw`
    UPDATE "Email"
    SET html = NULL, text = NULL, attachments = NULL, headers = NULL
    WHERE id IN (${Prisma.join(ids)})
      AND "createdAt" < ${cutoff}
      AND "updatedAt" < ${cutoff}
      AND ("scheduledAt" IS NULL OR "scheduledAt" < ${cutoff})
      AND "latestStatus" NOT IN ('SCHEDULED', 'QUEUED')
      AND (html IS NOT NULL OR text IS NOT NULL
           OR attachments IS NOT NULL OR headers IS NOT NULL)
  `;
  const stillWithContent = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Email"
    WHERE id IN (${Prisma.join(ids)})
      AND (html IS NOT NULL OR text IS NOT NULL
           OR attachments IS NOT NULL OR headers IS NOT NULL)
  `;
  return { cleared, notYet: stillWithContent.map((row) => row.id) };
}

/** Looks at the next emails older than the cutoff, after `after`. */
async function clearNextBatch(
  cutoff: Date,
  after: Position | null,
  size: number,
) {
  return withBatchTimeouts(async (tx) => {
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
    if (rows.length === 0) {
      return { looked: 0, cleared: 0, notYet: [] as string[], last: null };
    }
    const { cleared, notYet } = await clearEligible(
      tx,
      rows.map((row) => row.id),
      cutoff,
    );
    return {
      looked: rows.length,
      cleared,
      notYet,
      last: rows[rows.length - 1]!,
    };
  });
}

/** Checks emails skipped on earlier nights again, by id. */
async function clearPending(
  cutoff: Date,
  pending: PendingStore,
  limits: typeof CLEANUP_LIMITS,
) {
  const ids = await pending.list(limits.maxPendingPerRun);
  let cleared = 0;
  for (let i = 0; i < ids.length; i += limits.batchSize) {
    const chunk = ids.slice(i, i + limits.batchSize);
    const result = await withBatchTimeouts((tx) =>
      clearEligible(tx, chunk, cutoff),
    );
    cleared += result.cleared;
    // Keep only the ones that still have content; drop cleared or deleted ones.
    const keep = new Set(result.notYet);
    await pending.remove(chunk.filter((id) => !keep.has(id)));
  }
  return { checked: ids.length, cleared };
}

export async function clearOldEmailBodies({
  cutoff,
  startAfter,
  saveProgress,
  pending,
  limits = CLEANUP_LIMITS,
  now = () => Date.now(),
}: {
  cutoff: Date;
  /** Where the last run stopped, if anywhere. */
  startAfter: Position | null;
  /** Called after every batch with how far this run has got. */
  saveProgress: (position: Position) => Promise<void>;
  pending: PendingStore;
  limits?: typeof CLEANUP_LIMITS;
  now?: () => number;
}) {
  const startedAt = now();
  const pendingResult = await clearPending(cutoff, pending, limits);

  let position = startAfter;
  let looked = 0;
  let cleared = pendingResult.cleared;
  let batches = 0;
  const result = (finished: boolean) => ({
    looked,
    cleared,
    batches,
    pendingChecked: pendingResult.checked,
    pendingCleared: pendingResult.cleared,
    finished,
    elapsedMs: now() - startedAt,
  });

  for (;;) {
    const remaining = limits.maxRowsPerRun - cleared;
    if (
      remaining <= 0 ||
      (batches > 0 && now() - startedAt >= limits.maxRunMs)
    ) {
      return result(false);
    }

    // Never look at more rows than the nightly cap has left, so it holds exactly.
    const size = Math.min(limits.batchSize, remaining);
    const batch = await clearNextBatch(cutoff, position, size);
    if (!batch.last) return result(true);

    looked += batch.looked;
    cleared += batch.cleared;
    batches += 1;
    if (batch.notYet.length > 0) await pending.add(batch.notYet);
    position = batch.last;
    await saveProgress(position);

    if (batch.looked < size) return result(true);
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
  const pendingKey = redisKey(PENDING_KEY);

  const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, {
    connection: getRedis(),
    prefix: BULL_PREFIX,
    skipVersionCheck: true,
  });

  const worker = new Worker(
    CLEANUP_QUEUE_NAME,
    async () => {
      const redis = getRedis();
      const cutoff = retentionCutoff(cleanupDays);
      const startAfter = parsePosition(await redis.get(watermarkKey));

      const result = await clearOldEmailBodies({
        cutoff,
        startAfter,
        saveProgress: async (position) => {
          await redis.set(watermarkKey, JSON.stringify(position));
        },
        pending: {
          list: (limit) => redis.srandmember(pendingKey, limit),
          add: async (ids) => {
            if (ids.length) await redis.sadd(pendingKey, ...ids);
          },
          remove: async (ids) => {
            if (ids.length) await redis.srem(pendingKey, ...ids);
          },
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
