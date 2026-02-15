import { Queue, Worker } from "bullmq";
import { db } from "~/server/db";
import { env } from "~/env";
import { getUsageDate, getUsageUnits } from "~/lib/usage";
import { sendUsageToStripe } from "~/server/billing/usage";
import { getRedis } from "~/server/redis";
import { DEFAULT_QUEUE_OPTIONS } from "../queue/queue-constants";
import { logger } from "../logger/log";

const USAGE_QUEUE_NAME = "usage-reporting";

const usageQueue = new Queue(USAGE_QUEUE_NAME, {
  connection: getRedis(),
});

const worker = new Worker(
  USAGE_QUEUE_NAME,
  async () => {
    // Get all teams with stripe customer IDs
    const teams = await db.team.findMany({
      where: {
        stripeCustomerId: {
          not: null,
        },
      },
      include: {
        dailyEmailUsages: {
          where: {
            // Get yesterday's date by subtracting 1 day from today
            date: {
              equals: getUsageDate(),
            },
          },
        },
      },
    });

    // Process each team
    for (const team of teams) {
      if (!team.stripeCustomerId) continue;

      const transactionUsage = team.dailyEmailUsages
        .filter((usage) => usage.type === "TRANSACTIONAL")
        .reduce((sum, usage) => sum + usage.sent, 0);

      const marketingUsage = team.dailyEmailUsages
        .filter((usage) => usage.type === "MARKETING")
        .reduce((sum, usage) => sum + usage.sent, 0);

      const totalUsage = getUsageUnits(marketingUsage, transactionUsage);

      try {
        await sendUsageToStripe(team.stripeCustomerId, totalUsage);
        logger.info(
          { teamId: team.id, date: getUsageDate(), usage: totalUsage },
          `[Usage Reporting] Reported usage for team`,
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            teamId: team.id,
            message: error instanceof Error ? error.message : error,
          },
          `[Usage Reporting] Failed to report usage for team`,
        );
      }
    }
  },
  {
    connection: getRedis(),
  },
);

// Schedule job to run daily
await usageQueue.upsertJobScheduler(
  "daily-usage-report",
  {
    pattern: "0 */12 * * *", // Run every 12 hours (at 00:00, 12:00 UTC)
    tz: "UTC",
  },
  {
    opts: {
      ...DEFAULT_QUEUE_OPTIONS,
    },
  },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, `[Usage Reporting] Job completed`);
});

worker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id }, `[Usage Reporting] Job failed`);
});
