import { Queue, Worker } from "bullmq";
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
// between. One big DELETE of months of rows writes a lot of WAL at once and
// holds a long transaction; small batches keep both bounded. A run stops after
// MAX_RUN_MS and the next night's run carries on.
const DELETE_BATCH_SIZE = 1000;
const PAUSE_BETWEEN_BATCHES_MS = 250;
const MAX_RUN_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  for (;;) {
    // Uses the createdAt index; ids keep each DELETE small and exact.
    const rows = await db.webhookCall.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    if (rows.length === 0) {
      return { deleted, batches, finished: true };
    }

    const result = await db.webhookCall.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    deleted += result.count;
    batches += 1;

    if (rows.length < batchSize) {
      return { deleted, batches, finished: true };
    }

    if (now() - startedAt >= maxRunMs) {
      return { deleted, batches, finished: false };
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
