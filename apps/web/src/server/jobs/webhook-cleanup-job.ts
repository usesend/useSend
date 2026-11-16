import { Queue, Worker } from "bullmq";
import { WebhookCallStatus } from "@prisma/client";
import { subDays } from "date-fns";
import { db } from "~/server/db";
import { getRedis, BULL_PREFIX } from "~/server/redis";
import {
  DEFAULT_QUEUE_OPTIONS,
  WEBHOOK_CLEANUP_QUEUE,
} from "../queue/queue-constants";
import { logger } from "../logger/log";

const WEBHOOK_RETENTION_DAYS = 30;

// Delete in small batches, each its own short transaction, with a pause in
// between, rather than one DELETE of months of rows (one long transaction and
// a burst of WAL). This limits the work per transaction and per night; it does
// not shrink the database files: deleted rows become reusable space after
// autovacuum. A run stops after MAX_RUN_MS and the next night's run carries on.
const DELETE_BATCH_SIZE = 1000;
const PAUSE_BETWEEN_BATCHES_MS = 250;
const MAX_RUN_MS = 10 * 60 * 1000;
// Per batch: give up rather than wait on a lock or a slow statement.
const BATCH_LOCK_TIMEOUT = "5s";
const BATCH_STATEMENT_TIMEOUT = "60s";
// Prisma's own interactive-transaction limits (its default timeout is 5s,
// which would cut a slow batch off first): room for the two statements above,
// and a short wait for a connection.
const BATCH_TRANSACTION_OPTIONS = { timeout: 130_000, maxWait: 2_000 };
const LOG_PROGRESS_EVERY_BATCHES = 50;

// Only calls that are finished. A call that is pending or in progress (for
// example an old call someone pressed Retry on) is never deleted.
const FINISHED_STATUSES: WebhookCallStatus[] = [
  WebhookCallStatus.DELIVERED,
  WebhookCallStatus.FAILED,
  WebhookCallStatus.DISCARDED,
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deletes one batch of finished webhook calls that were created and last
 * updated before the cutoff. The same conditions are checked again in the
 * DELETE, so a call retried after it was selected is kept.
 */
async function deleteBatch(cutoff: Date, batchSize: number) {
  const oldAndFinished = {
    createdAt: { lt: cutoff },
    updatedAt: { lt: cutoff },
    status: { in: FINISHED_STATUSES },
  };

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL lock_timeout = '${BATCH_LOCK_TIMEOUT}'`,
    );
    await tx.$executeRawUnsafe(
      `SET LOCAL statement_timeout = '${BATCH_STATEMENT_TIMEOUT}'`,
    );

    // Uses the createdAt index; ids keep the DELETE small and exact.
    const rows = await tx.webhookCall.findMany({
      where: oldAndFinished,
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (rows.length === 0) return { selected: 0, deleted: 0 };

    const result = await tx.webhookCall.deleteMany({
      where: { id: { in: rows.map((row) => row.id) }, ...oldAndFinished },
    });

    return { selected: rows.length, deleted: result.count };
  }, BATCH_TRANSACTION_OPTIONS);
}

export async function deleteOldWebhookCalls({
  cutoff,
  batchSize = DELETE_BATCH_SIZE,
  pauseMs = PAUSE_BETWEEN_BATCHES_MS,
  maxRunMs = MAX_RUN_MS,
  now = () => Date.now(),
}: {
  cutoff: Date;
  batchSize?: number;
  pauseMs?: number;
  maxRunMs?: number;
  now?: () => number;
}) {
  const startedAt = now();
  let deleted = 0;
  let batches = 0;
  const progress = (finished: boolean) => ({
    deleted,
    batches,
    finished,
    elapsedMs: now() - startedAt,
  });

  for (;;) {
    // Check the deadline before starting each batch.
    if (batches > 0 && now() - startedAt >= maxRunMs) {
      return progress(false);
    }

    const batch = await deleteBatch(cutoff, batchSize);
    deleted += batch.deleted;
    if (batch.selected === 0) return progress(true);
    batches += 1;

    if (batch.selected < batchSize) return progress(true);

    if (batches % LOG_PROGRESS_EVERY_BATCHES === 0) {
      logger.info(
        { ...progress(false), cutoff: cutoff.toISOString() },
        "[WebhookCleanupJob]: Still deleting old webhook calls",
      );
    }

    await sleep(pauseMs);
  }
}

const webhookCleanupQueue = new Queue(WEBHOOK_CLEANUP_QUEUE, {
  connection: getRedis(),
  prefix: BULL_PREFIX,
  skipVersionCheck: true,
});

const worker = new Worker(
  WEBHOOK_CLEANUP_QUEUE,
  async () => {
    const cutoff = subDays(new Date(), WEBHOOK_RETENTION_DAYS);
    const result = await deleteOldWebhookCalls({ cutoff });

    logger.info(
      { ...result, cutoff: cutoff.toISOString() },
      result.finished
        ? "[WebhookCleanupJob]: Deleted old webhook calls"
        : "[WebhookCleanupJob]: Deleted old webhook calls; more remain for the next run",
    );
  },
  {
    connection: getRedis(),
    prefix: BULL_PREFIX,
    skipVersionCheck: true,
  },
);

await webhookCleanupQueue.upsertJobScheduler(
  "webhook-cleanup-daily",
  {
    pattern: "0 3 * * *", // daily at 03:00 UTC
    tz: "UTC",
  },
  {
    opts: {
      ...DEFAULT_QUEUE_OPTIONS,
    },
  },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[WebhookCleanupJob]: Job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id }, "[WebhookCleanupJob]: Job failed");
});
