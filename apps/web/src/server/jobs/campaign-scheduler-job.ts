import { Queue, Worker } from "bullmq";
import { createWorkerHandler, TeamJob } from "../queue/bullmq-context";
import {
  CAMPAIGN_SCHEDULER_QUEUE,
  DEFAULT_QUEUE_OPTIONS,
} from "../queue/queue-constants";
import { getRedis, BULL_PREFIX } from "../redis";
import { CampaignBatchService } from "../service/campaign-service";
import { db } from "../db";
import { logger } from "../logger/log";

const SCHEDULER_TICK_MS = 1500;

type SchedulerJob = TeamJob<{}>;

export async function runCampaignSchedulerTick() {
  try {
    const now = new Date();
    const campaigns = await db.campaign.findMany({
      where: {
        status: { in: ["SCHEDULED", "RUNNING"] },
        AND: [
          {
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
          },
          {
            OR: [
              { deliveryMode: "ALL_AT_ONCE" },
              { nextDeliveryAt: null },
              { nextDeliveryAt: { lte: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        teamId: true,
        lastSentAt: true,
        batchWindowMinutes: true,
      },
    });

    const enqueuePromises: Promise<void>[] = [];
    for (const campaign of campaigns) {
      const windowMin = campaign.batchWindowMinutes ?? 0;
      if (windowMin > 0 && campaign.lastSentAt) {
        const elapsedMs =
          now.getTime() - new Date(campaign.lastSentAt).getTime();
        const windowMs = windowMin * 60 * 1000;
        if (elapsedMs < windowMs) {
          const remainingMs = windowMs - elapsedMs;
          logger.debug(
            { campaignId: campaign.id, remainingMs, windowMs },
            "Skip queueing batch; window not elapsed",
          );
          continue;
        }
      }
      enqueuePromises.push(
        CampaignBatchService.queueBatch({
          campaignId: campaign.id,
          teamId: campaign.teamId,
        }).catch((err) => {
          logger.error(
            { err, campaignId: campaign.id },
            "Failed to enqueue campaign batch",
          );
          throw err;
        }),
      );
    }

    if (enqueuePromises.length > 0) {
      const results = await Promise.allSettled(enqueuePromises);
      const rejected = results.filter(
        (result) => result.status === "rejected",
      ).length;
      const fulfilled = results.length - rejected;
      logger.debug(
        { total: results.length, fulfilled, rejected },
        "Scheduler enqueue summary",
      );
    }
  } catch (err) {
    logger.error({ err }, "Campaign scheduler tick failed");
  }
}

export class CampaignSchedulerService {
  private static schedulerQueue = new Queue<SchedulerJob>(
    CAMPAIGN_SCHEDULER_QUEUE,
    {
      connection: getRedis(),
      prefix: BULL_PREFIX,
      skipVersionCheck: true,
    },
  );

  static worker = new Worker(
    CAMPAIGN_SCHEDULER_QUEUE,
    createWorkerHandler(runCampaignSchedulerTick),
    {
      connection: getRedis(),
      concurrency: 1,
      prefix: BULL_PREFIX,
      skipVersionCheck: true,
    },
  );

  static async start() {
    try {
      await this.schedulerQueue.add(
        "tick",
        {},
        {
          jobId: "campaign-scheduler",
          repeat: { every: SCHEDULER_TICK_MS },
          ...DEFAULT_QUEUE_OPTIONS,
        },
      );
    } catch (err) {
      // Adding the same repeatable job is idempotent; ignore job-exists errors
      logger.info({ err }, "Scheduler start attempted");
    }
  }
}
