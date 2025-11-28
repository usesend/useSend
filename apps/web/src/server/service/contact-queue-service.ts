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
      concurrency: 20,
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
}

async function processContactJob(job: ContactJob) {
  const { contactBookId, contact, teamId } = job.data;

  logger.info(
    { contactEmail: contact.email, contactBookId },
    "[ContactQueueService]: Processing contact job",
  );

  try {
    await addOrUpdateContact(contactBookId, contact, teamId);
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

export { ContactQueueService };
