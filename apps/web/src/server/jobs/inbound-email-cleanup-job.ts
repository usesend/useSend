import { Queue, Worker } from "bullmq";
import { subDays } from "date-fns";
import { db } from "~/server/db";
import { getRedis } from "~/server/redis";
import { DEFAULT_QUEUE_OPTIONS, INBOUND_EMAIL_CLEANUP_QUEUE } from "../queue/queue-constants";
import { logger } from "../logger/log";

const INBOUND_EMAIL_RETENTION_DAYS = 30;

const inboundEmailCleanupQueue = new Queue(INBOUND_EMAIL_CLEANUP_QUEUE, {
  connection: getRedis(),
});

const worker = new Worker(
  INBOUND_EMAIL_CLEANUP_QUEUE,
  async () => {
    const cutoff = subDays(new Date(), INBOUND_EMAIL_RETENTION_DAYS);
    const result = await db.inboundEmail.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });

    logger.info(
      { deleted: result.count, cutoff: cutoff.toISOString() },
      "[InboundEmailCleanupJob]: Deleted old inbound email records",
    );
  },
  {
    connection: getRedis(),
  }
);

await inboundEmailCleanupQueue.upsertJobScheduler(
  "inbound-email-cleanup-daily",
  {
    pattern: "0 3 * * *",
    tz: "UTC",
  },
  {
    opts: {
      ...DEFAULT_QUEUE_OPTIONS,
    },
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[InboundEmailCleanupJob]: Job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id }, "[InboundEmailCleanupJob]: Job failed");
});
