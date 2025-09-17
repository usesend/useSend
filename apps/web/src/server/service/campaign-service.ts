import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import { db } from "../db";
import { createHash } from "crypto";
import { env } from "~/env";
import {
  Campaign,
  Contact,
  EmailStatus,
  UnsubscribeReason,
} from "@prisma/client";
import { validateDomainFromEmail } from "./domain-service";
import { EmailQueueService } from "./email-queue-service";
import { Queue, Worker } from "bullmq";
import { getRedis } from "../redis";
import {
  CAMPAIGN_MAIL_PROCESSING_QUEUE,
  CAMPAIGN_BATCH_QUEUE,
  CAMPAIGN_SCHEDULER_QUEUE,
  DEFAULT_QUEUE_OPTIONS,
} from "../queue/queue-constants";
import { logger } from "../logger/log";
import { createWorkerHandler, TeamJob } from "../queue/bullmq-context";
import { SuppressionService } from "./suppression-service";

export async function sendCampaign(id: string) {
  let campaign = await db.campaign.findUnique({
    where: { id },
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (!campaign.content) {
    throw new Error("No content added for campaign");
  }

  let jsonContent: Record<string, any>;

  try {
    jsonContent = JSON.parse(campaign.content);
    const renderer = new EmailRenderer(jsonContent);
    const html = await renderer.render();
    campaign = await db.campaign.update({
      where: { id },
      data: { html },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to parse campaign content");
    throw new Error("Failed to parse campaign content");
  }

  if (!campaign.contactBookId) {
    throw new Error("No contact book found for campaign");
  }

  if (!campaign.html) {
    throw new Error("No HTML content for campaign");
  }

  // Count subscribed contacts for total, don't load all into memory
  const total = await db.contact.count({
    where: { contactBookId: campaign.contactBookId, subscribed: true },
  });

  // Mark as scheduled (or keep running if already running), set totals and scheduledAt if not set
  await db.campaign.update({
    where: { id },
    data: {
      status: "SCHEDULED",
      total,
      scheduledAt: campaign.scheduledAt ?? new Date(),
      lastCursor: campaign.lastCursor ?? null,
    },
  });

  // Kick off first batch immediately (idempotent by jobId)
  await CampaignBatchService.queueBatch({
    campaignId: id,
    teamId: campaign.teamId,
  });
}

export function createUnsubUrl(contactId: string, campaignId: string) {
  const unsubId = `${contactId}-${campaignId}`;

  const unsubHash = createHash("sha256")
    .update(`${unsubId}-${env.NEXTAUTH_SECRET}`)
    .digest("hex");

  return `${env.NEXTAUTH_URL}/unsubscribe?id=${unsubId}&hash=${unsubHash}`;
}

export function createOneClickUnsubUrl(contactId: string, campaignId: string) {
  const unsubId = `${contactId}-${campaignId}`;

  const unsubHash = createHash("sha256")
    .update(`${unsubId}-${env.NEXTAUTH_SECRET}`)
    .digest("hex");

  return `${env.NEXTAUTH_URL}/api/unsubscribe-oneclick?id=${unsubId}&hash=${unsubHash}`;
}

export async function unsubscribeContactFromLink(id: string, hash: string) {
  const [contactId, campaignId] = id.split("-");

  if (!contactId || !campaignId) {
    throw new Error("Invalid unsubscribe link");
  }

  // Verify the hash
  const expectedHash = createHash("sha256")
    .update(`${id}-${env.NEXTAUTH_SECRET}`)
    .digest("hex");

  if (hash !== expectedHash) {
    throw new Error("Invalid unsubscribe link");
  }

  return await unsubscribeContact({
    contactId,
    campaignId,
    reason: UnsubscribeReason.UNSUBSCRIBED,
  });
}

export async function unsubscribeContact({
  contactId,
  campaignId,
  reason,
}: {
  contactId: string;
  campaignId?: string;
  reason: UnsubscribeReason;
}) {
  // Update the contact's subscription status
  try {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      throw new Error("Contact not found");
    }

    if (contact.subscribed) {
      await db.contact.update({
        where: { id: contactId },
        data: { subscribed: false, unsubscribeReason: reason },
      });

      if (campaignId) {
        await db.campaign.update({
          where: { id: campaignId },
          data: {
            unsubscribed: {
              increment: 1,
            },
          },
        });
      }
    }

    return contact;
  } catch (error) {
    logger.error({ err: error }, "Error unsubscribing contact");
    throw new Error("Failed to unsubscribe contact");
  }
}

export async function subscribeContact(id: string, hash: string) {
  const [contactId, campaignId] = id.split("-");

  if (!contactId || !campaignId) {
    throw new Error("Invalid subscribe link");
  }

  // Verify the hash
  const expectedHash = createHash("sha256")
    .update(`${id}-${env.NEXTAUTH_SECRET}`)
    .digest("hex");

  if (hash !== expectedHash) {
    throw new Error("Invalid subscribe link");
  }

  // Update the contact's subscription status
  try {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      throw new Error("Contact not found");
    }

    if (!contact.subscribed) {
      await db.contact.update({
        where: { id: contactId },
        data: { subscribed: true },
      });

      await db.campaign.update({
        where: { id: campaignId },
        data: {
          unsubscribed: {
            decrement: 1,
          },
        },
      });
    }

    return true;
  } catch (error) {
    logger.error({ err: error }, "Error subscribing contact");
    throw new Error("Failed to subscribe contact");
  }
}

type CampainEmail = {
  campaignId: string;
  from: string;
  subject: string;
  html: string;
  previewText?: string;
  replyTo?: string[];
  cc?: string[];
  bcc?: string[];
  teamId: number;
  contacts: Array<Contact>;
};

type CampaignEmailJob = {
  contact: Contact;
  campaign: Campaign;
  emailConfig: {
    from: string;
    subject: string;
    replyTo?: string[];
    cc?: string[];
    bcc?: string[];
    teamId: number;
    campaignId: string;
    previewText?: string;
    domainId: number;
    region: string;
  };
};

type QueueCampaignEmailJob = TeamJob<CampaignEmailJob>;

async function processContactEmail(jobData: CampaignEmailJob) {
  const { contact, campaign, emailConfig } = jobData;
  const jsonContent = JSON.parse(campaign.content || "{}");
  const renderer = new EmailRenderer(jsonContent);

  const unsubscribeUrl = createUnsubUrl(contact.id, emailConfig.campaignId);
  const oneClickUnsubUrl = createOneClickUnsubUrl(
    contact.id,
    emailConfig.campaignId
  );

  // Check for suppressed emails before processing
  const toEmails = [contact.email];
  const ccEmails = emailConfig.cc || [];
  const bccEmails = emailConfig.bcc || [];

  // Collect all unique emails to check for suppressions
  const allEmailsToCheck = [
    ...new Set([...toEmails, ...ccEmails, ...bccEmails]),
  ];

  const suppressionResults = await SuppressionService.checkMultipleEmails(
    allEmailsToCheck,
    emailConfig.teamId
  );

  // Filter each field separately
  const filteredToEmails = toEmails.filter(
    (email) => !suppressionResults[email]
  );
  const filteredCcEmails = ccEmails.filter(
    (email) => !suppressionResults[email]
  );
  const filteredBccEmails = bccEmails.filter(
    (email) => !suppressionResults[email]
  );

  // Check if the contact's email (TO recipient) is suppressed
  const isContactSuppressed = filteredToEmails.length === 0;

  const html = await renderer.render({
    shouldReplaceVariableValues: true,
    variableValues: {
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
    },
    linkValues: {
      "{{unsend_unsubscribe_url}}": unsubscribeUrl,
      "{{usesend_unsubscribe_url}}": unsubscribeUrl,
    },
  });

  if (isContactSuppressed) {
    // Create suppressed email record
    logger.info(
      {
        contactEmail: contact.email,
        campaignId: emailConfig.campaignId,
        teamId: emailConfig.teamId,
      },
      "Contact email is suppressed. Creating suppressed email record."
    );

    const email = await db.email.create({
      data: {
        to: toEmails,
        replyTo: emailConfig.replyTo,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        bcc: bccEmails.length > 0 ? bccEmails : undefined,
        from: emailConfig.from,
        subject: emailConfig.subject,
        html,
        text: emailConfig.previewText,
        teamId: emailConfig.teamId,
        campaignId: emailConfig.campaignId,
        contactId: contact.id,
        domainId: emailConfig.domainId,
        latestStatus: "SUPPRESSED",
      },
    });

    await db.emailEvent.create({
      data: {
        emailId: email.id,
        status: "SUPPRESSED",
        data: {
          error: "Contact email is suppressed. No email sent.",
        },
        teamId: emailConfig.teamId,
      },
    });

    return;
  }

  // Log if any CC/BCC emails were filtered out
  if (ccEmails.length > filteredCcEmails.length) {
    logger.info(
      {
        originalCc: ccEmails,
        filteredCc: filteredCcEmails,
        campaignId: emailConfig.campaignId,
        teamId: emailConfig.teamId,
      },
      "Some CC recipients were suppressed and filtered out from campaign email."
    );
  }

  if (bccEmails.length > filteredBccEmails.length) {
    logger.info(
      {
        originalBcc: bccEmails,
        filteredBcc: filteredBccEmails,
        campaignId: emailConfig.campaignId,
        teamId: emailConfig.teamId,
      },
      "Some BCC recipients were suppressed and filtered out from campaign email."
    );
  }

  // Create email with filtered recipients
  const email = await db.email.create({
    data: {
      to: filteredToEmails,
      replyTo: emailConfig.replyTo,
      cc: filteredCcEmails.length > 0 ? filteredCcEmails : undefined,
      bcc: filteredBccEmails.length > 0 ? filteredBccEmails : undefined,
      from: emailConfig.from,
      subject: emailConfig.subject,
      html,
      text: emailConfig.previewText,
      teamId: emailConfig.teamId,
      campaignId: emailConfig.campaignId,
      contactId: contact.id,
      domainId: emailConfig.domainId,
    },
  });

  // Queue email for sending
  await EmailQueueService.queueEmail(
    email.id,
    emailConfig.teamId,
    emailConfig.region,
    false,
    oneClickUnsubUrl
  );
}

export async function sendCampaignEmail(
  campaign: Campaign,
  emailData: CampainEmail
) {
  const {
    campaignId,
    from,
    subject,
    replyTo,
    cc,
    bcc,
    teamId,
    contacts,
    previewText,
  } = emailData;

  const domain = await validateDomainFromEmail(from, teamId);

  logger.info("Bulk queueing contacts");

  await CampaignEmailService.queueBulkContacts(
    contacts.map((contact) => ({
      contact,
      campaign,
      emailConfig: {
        from,
        subject,
        replyTo: replyTo
          ? Array.isArray(replyTo)
            ? replyTo
            : [replyTo]
          : undefined,
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
        teamId,
        campaignId,
        previewText,
        domainId: domain.id,
        region: domain.region,
      },
    }))
  );
}

export async function updateCampaignAnalytics(
  campaignId: string,
  emailStatus: EmailStatus,
  hardBounce: boolean = false
) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const updateData: Record<string, any> = {};

  switch (emailStatus) {
    case EmailStatus.SENT:
      updateData.sent = { increment: 1 };
      break;
    case EmailStatus.DELIVERED:
      updateData.delivered = { increment: 1 };
      break;
    case EmailStatus.OPENED:
      updateData.opened = { increment: 1 };
      break;
    case EmailStatus.CLICKED:
      updateData.clicked = { increment: 1 };
      break;
    case EmailStatus.BOUNCED:
      updateData.bounced = { increment: 1 };
      if (hardBounce) {
        updateData.hardBounced = { increment: 1 };
      }
      break;
    case EmailStatus.COMPLAINED:
      updateData.complained = { increment: 1 };
      break;
    default:
      break;
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: updateData,
  });
}

const CAMPAIGN_EMAIL_CONCURRENCY = 50;

class CampaignEmailService {
  private static campaignQueue = new Queue<QueueCampaignEmailJob>(
    CAMPAIGN_MAIL_PROCESSING_QUEUE,
    {
      connection: getRedis(),
    }
  );

  // TODO: Add team context to job data when queueing
  static worker = new Worker(
    CAMPAIGN_MAIL_PROCESSING_QUEUE,
    createWorkerHandler(async (job: QueueCampaignEmailJob) => {
      await processContactEmail(job.data);
    }),
    {
      connection: getRedis(),
      concurrency: CAMPAIGN_EMAIL_CONCURRENCY,
    }
  );

  static async queueContact(data: CampaignEmailJob) {
    return await this.campaignQueue.add(
      `contact-${data.contact.id}`,
      {
        ...data,
        teamId: data.emailConfig.teamId,
      },
      DEFAULT_QUEUE_OPTIONS
    );
  }

  static async queueBulkContacts(data: CampaignEmailJob[]) {
    return await this.campaignQueue.addBulk(
      data.map((item) => ({
        name: `contact-${item.contact.id}`,
        data: {
          ...item,
          teamId: item.emailConfig.teamId,
        },
        opts: {
          ...DEFAULT_QUEUE_OPTIONS,
        },
      }))
    );
  }
}

// ---------------------------
// Simple campaign batch queue
// ---------------------------

type CampaignBatchJob = TeamJob<{ campaignId: string }>;

class CampaignBatchService {
  private static batchQueue = new Queue<CampaignBatchJob>(
    CAMPAIGN_BATCH_QUEUE,
    {
      connection: getRedis(),
    }
  );

  static worker = new Worker(
    CAMPAIGN_BATCH_QUEUE,
    createWorkerHandler(async (job: CampaignBatchJob) => {
      const { campaignId } = job.data;

      const campaign = await db.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) return;
      if (!campaign.contactBookId) return;

      // Skip paused campaigns
      if (campaign.status === "PAUSED") return;

      // Respect scheduledAt if set
      if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now())
        return;

      // First touch moves SCHEDULED -> RUNNING
      if (campaign.status === "SCHEDULED") {
        await db.campaign.update({
          where: { id: campaignId },
          data: { status: "RUNNING" },
        });
      }

      const batchSize = campaign.batchSize ?? 500;

      const where = {
        contactBookId: campaign.contactBookId,
        subscribed: true,
      } as const;
      const pagination: any = {
        take: batchSize,
        orderBy: { id: "asc" as const },
      };
      if (campaign.lastCursor) {
        pagination.cursor = { id: campaign.lastCursor };
        pagination.skip = 1; // do not include the cursor row
      }

      const contacts = await db.contact.findMany({ where, ...pagination });

      if (contacts.length === 0) {
        // No more contacts -> mark SENT
        await db.campaign.update({
          where: { id: campaignId },
          data: { status: "SENT" },
        });
        return;
      }

      // Fetch domain for region and id
      const domain = await db.domain.findUnique({
        where: { id: campaign.domainId },
      });
      if (!domain) return;

      // Bulk existence check to avoid duplicates while unique is not enforced
      const existing = await db.email.findMany({
        where: {
          campaignId: campaign.id,
          contactId: { in: contacts.map((c) => c.id) },
        },
        select: { contactId: true },
      });
      const existingSet = new Set(existing.map((e) => e.contactId));

      // Process each contact in this batch
      for (const contact of contacts) {
        if (existingSet.has(contact.id)) continue;

        await processContactEmail({
          contact,
          campaign,
          emailConfig: {
            from: campaign.from,
            subject: campaign.subject,
            replyTo: Array.isArray(campaign.replyTo) ? campaign.replyTo : [],
            cc: Array.isArray(campaign.cc) ? campaign.cc : [],
            bcc: Array.isArray(campaign.bcc) ? campaign.bcc : [],
            teamId: campaign.teamId,
            campaignId: campaign.id,
            previewText: campaign.previewText ?? undefined,
            domainId: domain.id,
            region: domain.region,
          },
        });
      }

      // Advance cursor and timestamp
      const newCursor = contacts[contacts.length - 1]?.id;
      await db.campaign.update({
        where: { id: campaignId },
        data: { lastCursor: newCursor, lastSentAt: new Date() },
      });
    }),
    { connection: getRedis(), concurrency: 20 }
  );

  static async queueBatch({
    campaignId,
    teamId,
  }: {
    campaignId: string;
    teamId?: number;
  }) {
    await this.batchQueue.add(
      `campaign-${campaignId}`,
      { campaignId, teamId },
      { jobId: `campaign-batch:${campaignId}`, ...DEFAULT_QUEUE_OPTIONS }
    );
  }
}

// ---------------------------
// Scheduler: BullMQ repeatable job
// ---------------------------

const SCHEDULER_TICK_MS = 1500;

type SchedulerJob = TeamJob<{}>;

class CampaignSchedulerService {
  private static schedulerQueue = new Queue<SchedulerJob>(
    CAMPAIGN_SCHEDULER_QUEUE,
    {
      connection: getRedis(),
    }
  );

  static worker = new Worker(
    CAMPAIGN_SCHEDULER_QUEUE,
    createWorkerHandler(async (_job: SchedulerJob) => {
      try {
        const now = new Date();
        const campaigns = await db.campaign.findMany({
          where: {
            status: { in: ["SCHEDULED", "RUNNING"] },
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
          },
          select: { id: true, teamId: true },
        });

        for (const c of campaigns) {
          await CampaignBatchService.queueBatch({
            campaignId: c.id,
            teamId: c.teamId,
          });
        }
      } catch (err) {
        logger.error({ err }, "Campaign scheduler tick failed");
      }
    }),
    { connection: getRedis(), concurrency: 1 }
  );

  static async ensureRepeatable() {
    try {
      await this.schedulerQueue.add(
        "tick",
        {},
        {
          jobId: "campaign-scheduler",
          repeat: { every: SCHEDULER_TICK_MS },
          ...DEFAULT_QUEUE_OPTIONS,
        }
      );
    } catch (err) {
      // Adding the same repeatable job is idempotent; ignore job-exists errors
      logger.info({ err }, "Scheduler ensureRepeatable attempted");
    }
  }
}

CampaignSchedulerService.ensureRepeatable();
