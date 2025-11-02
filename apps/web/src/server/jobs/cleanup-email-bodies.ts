import { Queue, Worker } from "bullmq";
import { db } from "~/server/db";
import { getRedis } from "~/server/redis";
import { logger } from "../logger/log";
import { DEFAULT_QUEUE_OPTIONS } from "../queue/queue-constants";
import { env } from "~/env";

const CLEANUP_QUEUE_NAME = "cleanup-email-bodies";

const CLEANUP_CRON = "0 0 * * *"; // default: midnight UTC
let CLEANUP_DAYS = Number(env.EMAIL_CLEANUP_DAYS ?? 90);

if (isNaN(CLEANUP_DAYS) || CLEANUP_DAYS <= 0) {
  logger.warn(
    `[Cleanup] Invalid EMAIL_CLEANUP_DAYS value: ${env.EMAIL_CLEANUP_DAYS}. Falling back to 90 days.`
  );
  CLEANUP_DAYS = 90;
}

/**
 * Initialize Queue
 */
const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, {
  connection: getRedis(),
});

const worker = new Worker(
  CLEANUP_QUEUE_NAME,
  async () => {
    logger.info(`[Cleanup] Starting cleanup for emails older than ${CLEANUP_DAYS} days...`);

    const result = await db.$executeRawUnsafe(`
      UPDATE "Email"
      SET "text" = NULL,
          "html" = NULL
      WHERE "createdAt" < NOW() - INTERVAL '${CLEANUP_DAYS} days'
      AND ("text" IS NOT NULL OR "html" IS NOT NULL);
    `);

    logger.info(`[Cleanup] Emails cleaned: ${result}`);
  },
  {
    connection: getRedis(),
  }
);

await cleanupQueue.upsertJobScheduler(
  "scheduled-email-cleanup",
  {
    pattern: CLEANUP_CRON,
    tz: "UTC",
  },
  {
    opts: {
      ...DEFAULT_QUEUE_OPTIONS,
    },
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, ` Email Body cleanup job completed`);
});

worker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id }, `Email Body cleanup job failed`);
});
