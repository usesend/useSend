import { Queue, Worker } from "bullmq";
import { getRedis } from "~/server/redis";
import {
  DEFAULT_QUEUE_OPTIONS,
  INBOUND_EMAIL_QUEUE,
} from "../queue/queue-constants";
import { getChildLogger, withLogger } from "../logger/log";
import { randomUUID } from "crypto";
import {
  processInboundEmail,
  InboundEmailJobData,
} from "../service/inbound-email-service";

export const inboundEmailQueue = new Queue<InboundEmailJobData>(
  INBOUND_EMAIL_QUEUE,
  {
    connection: getRedis(),
    defaultJobOptions: DEFAULT_QUEUE_OPTIONS,
  }
);

const worker = new Worker<InboundEmailJobData>(
  INBOUND_EMAIL_QUEUE,
  async (job) => {
    return await withLogger(
      getChildLogger({
        queueId: job.id ?? randomUUID(),
        inboundEmailId: job.data.inboundEmailId,
      }),
      async () => {
        await processInboundEmail(job.data);
      }
    );
  },
  {
    connection: getRedis(),
    concurrency: 25,
  }
);

worker.on("completed", (job) => {
  const logger = getChildLogger({ jobId: job.id });
  logger.info("[InboundEmailWorker]: Job completed");
});

worker.on("failed", (job, err) => {
  const logger = getChildLogger({ jobId: job?.id });
  logger.error({ err }, "[InboundEmailWorker]: Job failed");
});
