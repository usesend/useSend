import { Queue, Worker } from "bullmq";
import { subDays } from "date-fns";
import { db } from "~/server/db";
import { getRedis } from "~/server/redis";
import { DEFAULT_QUEUE_OPTIONS, WEBHOOK_CLEANUP_QUEUE } from "../queue/queue-constants";
import { logger } from "../logger/log";

const WEBHOOK_RETENTION_DAYS = 30;

const webhookCleanupQueue = new Queue(WEBHOOK_CLEANUP_QUEUE, {
  connection: getRedis(),
});

const worker = new Worker(
  WEBHOOK_CLEANUP_QUEUE,
  async () => {
    const cutoff = subDays(new Date(), WEBHOOK_RETENTION_DAYS);
    const result = await db.webhookCall.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });

    logger.info(
      { deleted: result.count, cutoff: cutoff.toISOString() },
      "[WebhookCleanupJob]: Deleted old webhook calls",
    );
  },
  {
    connection: getRedis(),
  }
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
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[WebhookCleanupJob]: Job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id }, "[WebhookCleanupJob]: Job failed");
});
