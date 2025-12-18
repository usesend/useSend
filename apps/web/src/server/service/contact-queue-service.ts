import { Queue, Worker } from "bullmq";
import { getRedis } from "../redis";
import {
  DEFAULT_QUEUE_OPTIONS,
  CONTACT_BULK_ADD_QUEUE,
} from "../queue/queue-constants";
import { logger } from "../logger/log";
import { createWorkerHandler, TeamJob } from "../queue/bullmq-context";
import { addOrUpdateContact, ContactInput } from "./contact-service";

type ContactJobData = {
  contactBookId: string;
  contact: ContactInput;
  teamId?: number;
};

type ContactJob = TeamJob<ContactJobData>;

// Constants for rate limiting
const MAX_CONTACTS_PER_BATCH = 1000;
const MAX_CONTACTS_PER_MINUTE = 2000;

class ContactQueueService {
  public static queue = new Queue<ContactJobData>(CONTACT_BULK_ADD_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: DEFAULT_QUEUE_OPTIONS,
  });

  public static worker = new Worker(
    CONTACT_BULK_ADD_QUEUE,
    createWorkerHandler(processContactJob),
    {
      connection: getRedis(),
      concurrency: 5, // Reduced from 20 to prevent overwhelming DB connections
    },
  );

  static {
    this.worker.on("error", (err) => {
      logger.error({ err }, "[ContactQueueService]: Worker error");
    });

    logger.info("[ContactQueueService]: Initialized contact queue service");
  }

  public static async addContactJob(
    contactBookId: string,
    contact: ContactInput,
    teamId?: number,
    delay?: number,
  ) {
    await this.queue.add(
      `add-contact-${contact.email}`,
      {
        contactBookId,
        contact,
        teamId,
      },
      {
        delay,
        ...DEFAULT_QUEUE_OPTIONS,
      },
    );
  }

  public static async addBulkContactJobs(
    contactBookId: string,
    contacts: ContactInput[],
    teamId?: number,
  ) {
    // Add validation and chunking for large batches
    if (contacts.length > MAX_CONTACTS_PER_BATCH) {
      logger.warn(
        { count: contacts.length, max: MAX_CONTACTS_PER_BATCH, contactBookId },
        "[ContactQueueService]: Large batch detected, processing in chunks",
      );

      // Process in chunks to prevent overwhelming the system
      const chunks = [];
      for (let i = 0; i < contacts.length; i += MAX_CONTACTS_PER_BATCH) {
        chunks.push(contacts.slice(i, i + MAX_CONTACTS_PER_BATCH));
      }

      let totalAdded = 0;
      for (const chunk of chunks) {
        const jobs = chunk.map((contact) => ({
          name: `add-contact-${contact.email}`,
          data: {
            contactBookId,
            contact,
            teamId,
          },
          opts: DEFAULT_QUEUE_OPTIONS,
        }));

        await this.queue.addBulk(jobs);
        totalAdded += chunk.length;
        logger.info(
          { chunkSize: chunk.length, totalAdded, contactBookId },
          "[ContactQueueService]: Added chunk to queue",
        );

        // Add a small delay between chunks to prevent overwhelming Redis
        if (totalAdded < contacts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      logger.info(
        { count: totalAdded, contactBookId },
        "[ContactQueueService]: Completed adding bulk contact jobs to queue",
      );
    } else {
      // For small batches, add all at once
      const jobs = contacts.map((contact) => ({
        name: `add-contact-${contact.email}`,
        data: {
          contactBookId,
          contact,
          teamId,
        },
        opts: DEFAULT_QUEUE_OPTIONS,
      }));

      await this.queue.addBulk(jobs);
      logger.info(
        { count: contacts.length, contactBookId },
        "[ContactQueueService]: Added bulk contact jobs to queue",
      );
    }
  }

  public static async getQueueStats() {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }

  /**
   * Pause queue processing - workers will stop picking up new jobs
   * Use this to temporarily stop the queue during issues
   */
  public static async pauseQueue() {
    await this.worker.pause();
    logger.info("[ContactQueueService]: Queue paused");
  }

  /**
   * Resume queue processing after being paused
   */
  public static async resumeQueue() {
    this.worker.resume();
    logger.info("[ContactQueueService]: Queue resumed");
  }

  /**
   * Drain the queue - wait for all active jobs to complete, then pause
   * Use this for graceful shutdown
   */
  public static async drainQueue() {
    await this.worker.close();
    logger.info("[ContactQueueService]: Queue drained");
  }

  /**
   * DANGER: Remove ALL jobs from the queue (waiting, active, completed, failed)
   * Use this only in emergency situations to stop a crash loop
   */
  public static async obliterateQueue() {
    await this.queue.obliterate({ force: true });
    logger.warn("[ContactQueueService]: Queue obliterated - all jobs removed");
  }

  /**
   * Remove only waiting jobs from the queue (keeps active jobs running)
   * Use this to stop new jobs from processing while letting current ones finish
   */
  public static async clearWaitingJobs() {
    const waiting = await this.queue.getWaiting();
    const count = waiting.length;
    await this.queue.clean(0, 0, "wait");
    logger.info(
      { count },
      "[ContactQueueService]: Cleared waiting jobs from queue",
    );
    return { cleared: count };
  }
}

async function processContactJob(job: ContactJob) {
  const { contactBookId, contact } = job.data;

  logger.info(
    { contactEmail: contact.email, contactBookId },
    "[ContactQueueService]: Processing contact job",
  );

  try {
    await addOrUpdateContact(contactBookId, contact);
    logger.info(
      { contactEmail: contact.email },
      "[ContactQueueService]: Successfully processed contact job",
    );
  } catch (error) {
    logger.error(
      { contactEmail: contact.email, error },
      "[ContactQueueService]: Failed to process contact job",
    );
    throw error;
  }
}

export { ContactQueueService, MAX_CONTACTS_PER_BATCH, MAX_CONTACTS_PER_MINUTE };
