import {Queue, Worker} from "bullmq";
import {db} from "~/server/db";
import {getRedis} from "~/server/redis";
import {logger} from "../logger/log";
import {DEFAULT_QUEUE_OPTIONS} from "../queue/queue-constants";
import {env} from "~/env";
import {isSelfHosted, isEmailCleanupEnabled} from "~/utils/common";

const CLEANUP_QUEUE_NAME = "cleanup-email-bodies";

const CLEANUP_CRON = "0 0 * * *"; // default: midnight UTC

// Only initialize if self hosted and cleanup enabled
if (isSelfHosted() && isEmailCleanupEnabled()) {
    const CLEANUP_DAYS = env.EMAIL_CLEANUP_DAYS!;

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

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_DAYS);

            const result = await db.email.updateMany({
                where: {
                    createdAt: {lt: cutoffDate},
                    OR: [
                        {text: {not: null}},
                        {html: {not: null}},
                    ],
                },
                data: {
                    text: null,
                    html: null,
                },
            });

            logger.info(`[Cleanup] Emails cleaned: ${result.count}`);
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
        logger.info({jobId: job.id}, ` Email Body cleanup job completed`);
    });

    worker.on("failed", (job, err) => {
        logger.error({err, jobId: job?.id}, `Email Body cleanup job failed`);
    });
}
