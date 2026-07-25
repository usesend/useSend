import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import { db } from "../db";
import { createHash } from "crypto";
import { env } from "~/env";
import {
  type Campaign,
  type Contact,
  type Email,
  EmailStatus,
  Prisma,
  UnsubscribeReason,
} from "@prisma/client";
import { EmailQueueService } from "./email-queue-service";
import { Queue, Worker } from "bullmq";
import { getRedis, BULL_PREFIX } from "../redis";
import {
  CAMPAIGN_BATCH_QUEUE,
  DEFAULT_QUEUE_OPTIONS,
} from "../queue/queue-constants";
import { logger } from "../logger/log";
import { createWorkerHandler, TeamJob } from "../queue/bullmq-context";
import { SuppressionService } from "./suppression-service";
import { UnsendApiError } from "../public-api/api-error";
import {
  validateApiKeyDomainAccess,
  validateDomainFromEmail,
} from "./domain-service";
import {
  BUILT_IN_CONTACT_VARIABLES,
  createCaseInsensitiveVariableValues,
  getContactReplacementValue,
  replaceContactVariables,
} from "../utils/contact-variable-replacement";
import { updateContactSubscription } from "./contact-service";
import { getCampaignUnsubscribeVariableValues } from "~/lib/constants/campaign";
import {
  calculateGradualDelivery,
  GRADUAL_DELIVERY_INTERVAL_MINUTES,
} from "~/lib/campaign-delivery";
import type { GradualDeliveryInterval } from "~/lib/campaign-delivery";

const GRADUAL_DELIVERY_INTERNAL_BATCH_SIZE = 500;
const CAMPAIGN_RECIPIENT_CLAIM_TIMEOUT_MS = 60 * 60 * 1000;
const CAMPAIGN_AUDIENCE_PREPARATION_TIMEOUT_MS = 30 * 60 * 1000;

type ClaimedCampaignRecipient = {
  contactId: string;
  claimProcessedAt: Date;
};

export type CampaignDeliveryInput =
  | { strategy: "ALL_AT_ONCE" }
  | {
      strategy: "GRADUAL";
      batchPercentage: number;
      interval: GradualDeliveryInterval;
    };

function assertCampaignCanBeScheduled(status: Campaign["status"]) {
  if (status === "SENT") {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message:
        "Completed campaigns cannot be scheduled again. Duplicate the campaign to send it again",
    });
  }

  if (status !== "DRAFT" && status !== "SCHEDULED") {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message:
        "Delivery settings cannot be changed after a campaign has started",
    });
  }
}

const CAMPAIGN_UNSUB_PLACEHOLDER_TOKENS = [
  "{{unsend_unsubscribe_url}}",
  "{{usesend_unsubscribe_url}}",
] as const;

const CAMPAIGN_UNSUB_PLACEHOLDER_REGEXES =
  CAMPAIGN_UNSUB_PLACEHOLDER_TOKENS.map((placeholder) => {
    const inner = placeholder.replace(/[{}]/g, "").trim();
    return new RegExp(`\\{\\{\\s*${inner}\\s*\\}}`, "i");
  });

function campaignHasUnsubscribePlaceholder(
  ...sources: Array<string | null | undefined>
) {
  return CAMPAIGN_UNSUB_PLACEHOLDER_REGEXES.some((regex) =>
    sources.some((source) => (source ? regex.test(source) : false)),
  );
}

function replaceUnsubscribePlaceholders(html: string, url: string) {
  return CAMPAIGN_UNSUB_PLACEHOLDER_REGEXES.reduce((acc, regex) => {
    return acc.replace(new RegExp(regex.source, "gi"), url);
  }, html);
}

function sanitizeAddressList(addresses?: string | string[]) {
  if (!addresses) {
    return [] as string[];
  }

  const list = Array.isArray(addresses) ? addresses : [addresses];

  return list
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
}

function getCampaignDeliveryData({
  delivery,
  audienceSize,
  startsAt,
}: {
  delivery?: CampaignDeliveryInput;
  audienceSize: number;
  startsAt: Date;
}) {
  if (!delivery || delivery.strategy === "ALL_AT_ONCE") {
    return {
      deliveryMode: "ALL_AT_ONCE" as const,
      deliveryBatchPercentage: null,
      deliveryIntervalMinutes: null,
      deliveryBatchSize: null,
    };
  }

  const intervalMinutes = GRADUAL_DELIVERY_INTERVAL_MINUTES[delivery.interval];
  const estimate = calculateGradualDelivery({
    audienceSize,
    batchPercentage: delivery.batchPercentage,
    intervalMinutes,
    startsAt,
  });

  return {
    deliveryMode: "GRADUAL" as const,
    deliveryBatchPercentage: delivery.batchPercentage,
    deliveryIntervalMinutes: intervalMinutes,
    deliveryBatchSize: estimate.batchSize,
  };
}

function getCampaignDraftDeliveryData(delivery?: CampaignDeliveryInput) {
  if (!delivery || delivery.strategy === "ALL_AT_ONCE") {
    return {
      deliveryMode: "ALL_AT_ONCE" as const,
      deliveryBatchPercentage: null,
      deliveryIntervalMinutes: null,
      deliveryBatchSize: null,
    };
  }

  return {
    deliveryMode: "GRADUAL" as const,
    deliveryBatchPercentage: delivery.batchPercentage,
    deliveryIntervalMinutes:
      GRADUAL_DELIVERY_INTERVAL_MINUTES[delivery.interval],
    deliveryBatchSize: null,
  };
}

function getStoredCampaignDelivery(campaign: Campaign): CampaignDeliveryInput {
  if (campaign.deliveryMode !== "GRADUAL") {
    return { strategy: "ALL_AT_ONCE" };
  }

  const interval = Object.entries(GRADUAL_DELIVERY_INTERVAL_MINUTES).find(
    ([, minutes]) => minutes === campaign.deliveryIntervalMinutes,
  )?.[0] as GradualDeliveryInterval | undefined;

  if (!campaign.deliveryBatchPercentage || !interval) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Gradual delivery configuration is incomplete",
    });
  }

  return {
    strategy: "GRADUAL",
    batchPercentage: campaign.deliveryBatchPercentage,
    interval,
  };
}

async function prepareCampaignHtml(
  campaign: Campaign,
): Promise<{ campaign: Campaign; html: string }> {
  if (campaign.content) {
    try {
      const jsonContent = JSON.parse(campaign.content);
      const renderer = new EmailRenderer(jsonContent);
      const html = await renderer.render();

      if (campaign.html !== html) {
        campaign = await db.campaign.update({
          where: { id: campaign.id },
          data: { html },
        });
      }

      return { campaign, html };
    } catch (error) {
      logger.error({ err: error }, "Failed to parse campaign content");
      throw new Error("Failed to parse campaign content");
    }
  }

  if (campaign.html) {
    return { campaign, html: campaign.html };
  }

  throw new Error("No content added for campaign");
}

async function renderCampaignHtmlForContact({
  campaign,
  contact,
  unsubscribeUrl,
  allowedVariables,
}: {
  campaign: Campaign;
  contact: Contact;
  unsubscribeUrl: string;
  allowedVariables: string[];
}) {
  if (campaign.content) {
    try {
      const jsonContent = JSON.parse(campaign.content);
      const renderer = new EmailRenderer(jsonContent);
      const linkValues: Record<string, string> = {};

      for (const token of CAMPAIGN_UNSUB_PLACEHOLDER_TOKENS) {
        linkValues[token] = unsubscribeUrl;
      }

      const variableValues = createCaseInsensitiveVariableValues({
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        ...allowedVariables.reduce(
          (acc, variable) => {
            const value = getContactReplacementValue({
              contact,
              key: variable,
              allowedVariables,
            });

            if (value !== undefined) {
              acc[variable] = value;
            }

            return acc;
          },
          {} as Record<string, string | null | undefined>,
        ),
        ...getCampaignUnsubscribeVariableValues(unsubscribeUrl),
      });

      return renderer.render({
        shouldReplaceVariableValues: true,
        variableValues,
        linkValues,
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to parse campaign content");
      throw new Error("Failed to parse campaign content");
    }
  }

  if (!campaign.html) {
    throw new Error("No HTML content for campaign");
  }

  let html = replaceUnsubscribePlaceholders(campaign.html, unsubscribeUrl);
  html = replaceContactVariables(html, contact, allowedVariables);

  return html;
}

export async function createCampaignFromApi({
  teamId,
  apiKeyId,
  name,
  from,
  subject,
  previewText,
  content,
  html,
  contactBookId,
  replyTo,
  cc,
  bcc,
  batchSize,
  delivery,
}: {
  teamId: number;
  apiKeyId?: number;
  name: string;
  from: string;
  subject: string;
  previewText?: string;
  content?: string;
  html?: string;
  contactBookId: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  batchSize?: number;
  delivery?: CampaignDeliveryInput;
}) {
  if (!content && !html) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Either content or html must be provided",
    });
  }

  if (content) {
    try {
      JSON.parse(content);
    } catch (error) {
      logger.error({ err: error }, "Invalid campaign content JSON from API");
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Invalid content JSON",
      });
    }
  }

  const contactBook = await db.contactBook.findUnique({
    where: { id: contactBookId, teamId },
    select: { id: true },
  });

  if (!contactBook) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Contact book not found",
    });
  }

  let domain;

  if (apiKeyId) {
    const apiKey = await db.apiKey.findUnique({
      where: { id: apiKeyId },
      include: { domain: true },
    });

    if (!apiKey || apiKey.teamId !== teamId) {
      throw new UnsendApiError({
        code: "FORBIDDEN",
        message: "Invalid API key",
      });
    }

    domain = await validateApiKeyDomainAccess(from, teamId, apiKey);
  } else {
    domain = await validateDomainFromEmail(from, teamId);
  }

  const sanitizedHtml = html?.trim();
  const sanitizedContent = content ?? null;

  const unsubPlaceholderFound = campaignHasUnsubscribePlaceholder(
    sanitizedContent,
    sanitizedHtml,
  );

  if (!unsubPlaceholderFound) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Campaign must include an unsubscribe link before sending",
    });
  }

  const campaign = await db.campaign.create({
    data: {
      name,
      from,
      subject,
      isApi: true,
      ...(previewText !== undefined ? { previewText } : {}),
      content: sanitizedContent,
      ...(sanitizedHtml && sanitizedHtml.length > 0
        ? { html: sanitizedHtml }
        : {}),
      contactBookId,
      replyTo: sanitizeAddressList(replyTo),
      cc: sanitizeAddressList(cc),
      bcc: sanitizeAddressList(bcc),
      teamId,
      domainId: domain.id,
      ...getCampaignDraftDeliveryData(delivery),
      ...(typeof batchSize === "number" ? { batchSize } : {}),
    },
  });

  return campaign;
}

export async function getCampaignForTeam({
  campaignId,
  teamId,
}: {
  campaignId: string;
  teamId: number;
}) {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, teamId },
    select: {
      id: true,
      name: true,
      from: true,
      subject: true,
      previewText: true,
      contactBookId: true,
      html: true,
      content: true,
      status: true,
      scheduledAt: true,
      batchSize: true,
      batchWindowMinutes: true,
      deliveryMode: true,
      deliveryBatchPercentage: true,
      deliveryIntervalMinutes: true,
      deliveryBatchSize: true,
      currentDeliveryBatch: true,
      deliveryBatchProcessed: true,
      nextDeliveryAt: true,
      total: true,
      sent: true,
      delivered: true,
      opened: true,
      clicked: true,
      unsubscribed: true,
      bounced: true,
      hardBounced: true,
      complained: true,
      replyTo: true,
      cc: true,
      bcc: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!campaign) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Campaign not found",
    });
  }

  return campaign;
}

export async function sendCampaign(id: string) {
  let campaign = await db.campaign.findUnique({
    where: { id },
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const prepared = await prepareCampaignHtml(campaign);
  campaign = prepared.campaign;
  const html = prepared.html;

  if (!campaign.contactBookId) {
    throw new Error("No contact book found for campaign");
  }

  if (!html) {
    throw new Error("No HTML content for campaign");
  }

  const unsubPlaceholderFound = campaignHasUnsubscribePlaceholder(
    campaign.content,
    html,
  );

  if (!unsubPlaceholderFound) {
    throw new Error("Campaign must include an unsubscribe link before sending");
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

export async function scheduleCampaign({
  campaignId,
  teamId,
  scheduledAt: scheduledAtInput,
  batchSize,
  delivery,
}: {
  campaignId: string;
  teamId: number;
  scheduledAt?: Date | string;
  batchSize?: number;
  delivery?: CampaignDeliveryInput;
}) {
  let campaign = await db.campaign.findUnique({
    where: { id: campaignId, teamId },
  });
  if (!campaign) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Campaign not found",
    });
  }

  assertCampaignCanBeScheduled(campaign.status);

  let html: string;
  try {
    const prepared = await prepareCampaignHtml(campaign);
    campaign = prepared.campaign;
    html = prepared.html;
  } catch (err) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: err instanceof Error ? err.message : "Invalid campaign content",
    });
  }

  if (!campaign.contactBookId) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "No contact book found for campaign",
    });
  }

  if (!html) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "No HTML content for campaign",
    });
  }

  const unsubPlaceholderFound = campaignHasUnsubscribePlaceholder(
    campaign.content,
    html,
  );
  if (!unsubPlaceholderFound) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Campaign must include an unsubscribe link before scheduling",
    });
  }

  // Count subscribed contacts for total
  const total = await db.contact.count({
    where: { contactBookId: campaign.contactBookId, subscribed: true },
  });

  if (total === 0) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "No subscribed contacts to send",
    });
  }

  const scheduledAt = scheduledAtInput
    ? scheduledAtInput instanceof Date
      ? scheduledAtInput
      : new Date(scheduledAtInput)
    : new Date();

  const shouldResetCursor = campaign.status === "DRAFT";

  const deliveryData = getCampaignDeliveryData({
    delivery: delivery ?? getStoredCampaignDelivery(campaign),
    audienceSize: total,
    startsAt: scheduledAt,
  });

  await db.$transaction(async (tx) => {
    const lockedCampaign = await tx.$queryRaw<
      Array<{ status: Campaign["status"] }>
    >`
      SELECT "status"
      FROM "Campaign"
      WHERE "id" = ${campaign.id}
        AND "teamId" = ${teamId}
      FOR UPDATE
    `;

    if (lockedCampaign.length === 0) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Campaign not found",
      });
    }

    assertCampaignCanBeScheduled(lockedCampaign[0]!.status);

    await tx.campaignEmail.deleteMany({
      where: { campaignId: campaign.id },
    });

    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "SCHEDULED",
        scheduledAt,
        total,
        ...deliveryData,
        currentDeliveryBatch: 0,
        deliveryBatchProcessed: 0,
        nextDeliveryAt: null,
        audienceCapturedAt: null,
        audiencePreparedAt: null,
        pausedAt: null,
        ...(batchSize ? { batchSize } : {}),
        ...(shouldResetCursor ? { lastCursor: null } : {}),
      },
    });
  });

  return { ok: true };
}

export async function pauseCampaign({
  campaignId,
  teamId,
}: {
  campaignId: string;
  teamId: number;
}) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId, teamId },
  });

  if (!campaign) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Campaign not found",
    });
  }

  if (campaign.status === "PAUSED") {
    return { ok: true };
  }

  await db.campaign.updateMany({
    where: {
      id: campaignId,
      teamId,
      status: campaign.status,
    },
    data: { status: "PAUSED", pausedAt: new Date() },
  });

  return { ok: true };
}

export async function resumeCampaign({
  campaignId,
  teamId,
}: {
  campaignId: string;
  teamId: number;
}) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId, teamId },
  });

  if (!campaign) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Campaign not found",
    });
  }

  const now = new Date();
  const pausedDurationMs = campaign.pausedAt
    ? Math.max(0, now.getTime() - campaign.pausedAt.getTime())
    : 0;
  const shiftedNextDeliveryAt = campaign.nextDeliveryAt
    ? new Date(campaign.nextDeliveryAt.getTime() + pausedDurationMs)
    : null;

  if (campaign.scheduledAt && campaign.scheduledAt.getTime() > now.getTime()) {
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status: "SCHEDULED",
        pausedAt: null,
        nextDeliveryAt: shiftedNextDeliveryAt,
      },
    });
  } else {
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status: "RUNNING",
        pausedAt: null,
        nextDeliveryAt: shiftedNextDeliveryAt,
      },
    });
  }

  return { ok: true };
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

function verifyUnsubscribeLink(id: string, hash: string) {
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

  return { contactId, campaignId };
}

export async function getContactFromUnsubscribeLink(id: string, hash: string) {
  const { contactId } = verifyUnsubscribeLink(id, hash);

  const contact = await db.contact.findUnique({
    where: { id: contactId },
  });

  if (!contact) {
    throw new Error("Contact not found");
  }

  return contact;
}

export async function unsubscribeContactFromLink(id: string, hash: string) {
  const { contactId, campaignId } = verifyUnsubscribeLink(id, hash);

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
      const updatedContact = await updateContactSubscription({
        contactId,
        subscribed: false,
        unsubscribeReason: reason,
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

      return updatedContact;
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
      await updateContactSubscription({
        contactId,
        subscribed: true,
        unsubscribeReason: null,
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

export async function deleteCampaign(id: string, teamId: number) {
  const existing = await db.campaign.findFirst({
    where: { id, teamId },
  });

  if (!existing) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Campaign not found",
    });
  }

  const campaign = await db.$transaction(async (tx) => {
    await tx.campaignEmail.deleteMany({
      where: { campaignId: id },
    });

    const campaign = await tx.campaign.delete({
      where: { id },
    });

    return campaign;
  });

  return campaign;
}

type CampaignEmailJob = {
  contact: Contact;
  campaign: Campaign;
  claimProcessedAt: Date;
  allowedVariables: string[];
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

type CampaignContactFailureInput = {
  contact: Pick<Contact, "id" | "email">;
  campaign: Pick<Campaign, "id" | "from" | "subject" | "html" | "previewText">;
  claimProcessedAt?: Date;
  emailConfig: {
    replyTo?: string[];
    cc?: string[];
    bcc?: string[];
    teamId: number;
    domainId: number;
  };
  error: unknown;
};

function getFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function recordCampaignContactFailure({
  contact,
  campaign,
  claimProcessedAt,
  emailConfig,
  error,
}: CampaignContactFailureInput) {
  const failureMessage = getFailureMessage(error);

  await db.$transaction(async (tx) => {
    const existingCampaignEmail = await tx.campaignEmail.findUnique({
      where: {
        campaignId_contactId: {
          campaignId: campaign.id,
          contactId: contact.id,
        },
      },
      select: { emailId: true, status: true, processedAt: true },
    });

    if (
      claimProcessedAt &&
      (existingCampaignEmail?.status !== "PROCESSING" ||
        existingCampaignEmail.processedAt?.getTime() !==
          claimProcessedAt.getTime())
    ) {
      return;
    }

    let emailId = existingCampaignEmail?.emailId;

    if (!emailId) {
      const existingEmail = claimProcessedAt
        ? null
        : await tx.email.findFirst({
            where: {
              campaignId: campaign.id,
              contactId: contact.id,
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          });

      if (existingEmail) {
        emailId = existingEmail.id;
      } else {
        const failedEmail = await tx.email.create({
          data: {
            to: [contact.email],
            replyTo: emailConfig.replyTo ?? [],
            cc: emailConfig.cc ?? [],
            bcc: emailConfig.bcc ?? [],
            from: campaign.from,
            subject: campaign.subject,
            html: campaign.html,
            text: campaign.previewText,
            teamId: emailConfig.teamId,
            campaignId: campaign.id,
            contactId: contact.id,
            domainId: emailConfig.domainId,
            latestStatus: "FAILED",
          },
          select: { id: true },
        });
        emailId = failedEmail.id;
      }

      if (claimProcessedAt) {
        const updatedRecipient = await tx.campaignEmail.updateMany({
          where: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: "PROCESSING",
            processedAt: claimProcessedAt,
          },
          data: { emailId, status: "FAILED", processedAt: new Date() },
        });

        if (updatedRecipient.count !== 1) {
          throw new Error("Campaign recipient claim was lost");
        }
      } else {
        await tx.campaignEmail.upsert({
          where: {
            campaignId_contactId: {
              campaignId: campaign.id,
              contactId: contact.id,
            },
          },
          create: {
            campaignId: campaign.id,
            contactId: contact.id,
            emailId,
            status: "FAILED",
            processedAt: new Date(),
          },
          update: {
            emailId,
            status: "FAILED",
            processedAt: new Date(),
          },
        });
      }
    }

    if (existingCampaignEmail?.emailId) {
      if (claimProcessedAt) {
        const updatedRecipient = await tx.campaignEmail.updateMany({
          where: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: "PROCESSING",
            processedAt: claimProcessedAt,
          },
          data: { status: "FAILED", processedAt: new Date() },
        });

        if (updatedRecipient.count !== 1) {
          return;
        }
      } else {
        await tx.campaignEmail.update({
          where: {
            campaignId_contactId: {
              campaignId: campaign.id,
              contactId: contact.id,
            },
          },
          data: { status: "FAILED", processedAt: new Date() },
        });
      }
    }

    await tx.email.update({
      where: { id: emailId },
      data: { latestStatus: "FAILED" },
    });

    await tx.emailEvent.create({
      data: {
        emailId,
        status: "FAILED",
        data: { error: failureMessage },
        teamId: emailConfig.teamId,
      },
    });
  });
}

export async function queueClaimedCampaignEmail({
  email,
  campaignId,
  contactId,
  claimProcessedAt,
  teamId,
  region,
  oneClickUnsubUrl,
}: {
  email: Pick<Email, "id" | "latestStatus" | "sesEmailId">;
  campaignId: string;
  contactId: string;
  claimProcessedAt: Date;
  teamId: number;
  region: string;
  oneClickUnsubUrl: string;
}) {
  if (
    !email.sesEmailId &&
    (email.latestStatus === "QUEUED" || email.latestStatus === "SCHEDULED")
  ) {
    await EmailQueueService.queueEmail(
      email.id,
      teamId,
      region,
      false,
      oneClickUnsubUrl,
    );
  }

  try {
    const updatedRecipient = await db.campaignEmail.updateMany({
      where: {
        campaignId,
        contactId,
        status: "PROCESSING",
        processedAt: claimProcessedAt,
        emailId: email.id,
      },
      data: {
        status: email.latestStatus === "FAILED" ? "FAILED" : "QUEUED",
        processedAt: new Date(),
      },
    });

    if (updatedRecipient.count !== 1) {
      logger.warn(
        { campaignId, contactId, emailId: email.id },
        "Campaign email was queued but recipient bookkeeping was deferred",
      );
      return { recoveryPending: true };
    }
  } catch (error) {
    // Redis may already contain (or may already have completed) this email job.
    // Leave the recipient claim recoverable instead of recording a false send
    // failure. Recovery reuses the same BullMQ job ID and skips emails that
    // already have an SES message ID.
    logger.warn(
      { err: error, campaignId, contactId, emailId: email.id },
      "Campaign email was queued but recipient bookkeeping failed",
    );
    return { recoveryPending: true };
  }

  return { recoveryPending: false };
}

async function processContactEmail(jobData: CampaignEmailJob) {
  const { contact, campaign, claimProcessedAt, emailConfig, allowedVariables } =
    jobData;

  const unsubscribeUrl = createUnsubUrl(contact.id, emailConfig.campaignId);
  const oneClickUnsubUrl = createOneClickUnsubUrl(
    contact.id,
    emailConfig.campaignId,
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
    emailConfig.teamId,
  );

  // Filter each field separately
  const filteredToEmails = toEmails.filter(
    (email) => !suppressionResults[email],
  );
  const filteredCcEmails = ccEmails.filter(
    (email) => !suppressionResults[email],
  );
  const filteredBccEmails = bccEmails.filter(
    (email) => !suppressionResults[email],
  );

  // Check if the contact's email (TO recipient) is suppressed
  const isContactSuppressed = filteredToEmails.length === 0;

  const html = await renderCampaignHtmlForContact({
    campaign,
    contact,
    unsubscribeUrl,
    allowedVariables,
  });
  const subject = replaceContactVariables(
    emailConfig.subject,
    contact,
    allowedVariables,
  );

  if (isContactSuppressed) {
    // Create suppressed email record
    logger.info(
      {
        contactEmail: contact.email,
        campaignId: emailConfig.campaignId,
        teamId: emailConfig.teamId,
      },
      "Contact email is suppressed. Creating suppressed email record.",
    );

    await db.$transaction(async (tx) => {
      const recipient = await tx.campaignEmail.findUnique({
        where: {
          campaignId_contactId: {
            campaignId: emailConfig.campaignId,
            contactId: contact.id,
          },
        },
        select: { emailId: true, status: true, processedAt: true },
      });

      if (
        recipient?.status !== "PROCESSING" ||
        recipient.processedAt?.getTime() !== claimProcessedAt.getTime()
      ) {
        throw new Error("Campaign recipient claim was lost");
      }

      let email = recipient.emailId
        ? await tx.email.findUnique({ where: { id: recipient.emailId } })
        : null;

      if (!email) {
        email = await tx.email.create({
          data: {
            to: toEmails,
            replyTo: emailConfig.replyTo,
            cc: ccEmails.length > 0 ? ccEmails : undefined,
            bcc: bccEmails.length > 0 ? bccEmails : undefined,
            from: emailConfig.from,
            subject,
            html,
            text: emailConfig.previewText,
            teamId: emailConfig.teamId,
            campaignId: emailConfig.campaignId,
            contactId: contact.id,
            domainId: emailConfig.domainId,
            latestStatus: "SUPPRESSED",
          },
        });

        await tx.emailEvent.create({
          data: {
            emailId: email.id,
            status: "SUPPRESSED",
            data: {
              error: "Contact email is suppressed. No email sent.",
            },
            teamId: emailConfig.teamId,
          },
        });
      } else if (email.latestStatus !== "SUPPRESSED") {
        email = await tx.email.update({
          where: { id: email.id },
          data: { latestStatus: "SUPPRESSED" },
        });

        await tx.emailEvent.create({
          data: {
            emailId: email.id,
            status: "SUPPRESSED",
            data: {
              error: "Contact email is suppressed. No email sent.",
            },
            teamId: emailConfig.teamId,
          },
        });
      }

      const updatedRecipient = await tx.campaignEmail.updateMany({
        where: {
          campaignId: emailConfig.campaignId,
          contactId: contact.id,
          status: "PROCESSING",
          processedAt: claimProcessedAt,
        },
        data: {
          emailId: email.id,
          status: "SUPPRESSED",
          processedAt: new Date(),
        },
      });

      if (updatedRecipient.count !== 1) {
        throw new Error("Campaign recipient claim was lost");
      }
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
      "Some CC recipients were suppressed and filtered out from campaign email.",
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
      "Some BCC recipients were suppressed and filtered out from campaign email.",
    );
  }

  const email = await db.$transaction(async (tx) => {
    const recipient = await tx.campaignEmail.findUnique({
      where: {
        campaignId_contactId: {
          campaignId: emailConfig.campaignId,
          contactId: contact.id,
        },
      },
      select: { emailId: true, status: true, processedAt: true },
    });

    if (
      recipient?.status !== "PROCESSING" ||
      recipient.processedAt?.getTime() !== claimProcessedAt.getTime()
    ) {
      throw new Error("Campaign recipient claim was lost");
    }

    if (recipient.emailId) {
      const existingEmail = await tx.email.findUnique({
        where: { id: recipient.emailId },
      });

      if (!existingEmail) {
        throw new Error("Claimed campaign email was not found");
      }

      return existingEmail;
    }

    const createdEmail = await tx.email.create({
      data: {
        to: filteredToEmails,
        replyTo: emailConfig.replyTo,
        cc: filteredCcEmails.length > 0 ? filteredCcEmails : undefined,
        bcc: filteredBccEmails.length > 0 ? filteredBccEmails : undefined,
        from: emailConfig.from,
        subject,
        html,
        text: emailConfig.previewText,
        teamId: emailConfig.teamId,
        campaignId: emailConfig.campaignId,
        contactId: contact.id,
        domainId: emailConfig.domainId,
      },
    });

    const linkedRecipient = await tx.campaignEmail.updateMany({
      where: {
        campaignId: emailConfig.campaignId,
        contactId: contact.id,
        status: "PROCESSING",
        processedAt: claimProcessedAt,
        emailId: null,
      },
      data: { emailId: createdEmail.id },
    });

    if (linkedRecipient.count !== 1) {
      throw new Error("Campaign recipient claim was lost");
    }

    return createdEmail;
  });

  await queueClaimedCampaignEmail({
    email,
    campaignId: emailConfig.campaignId,
    contactId: contact.id,
    claimProcessedAt,
    teamId: emailConfig.teamId,
    region: emailConfig.region,
    oneClickUnsubUrl,
  });
}

export async function updateCampaignAnalytics(
  campaignId: string,
  emailStatus: EmailStatus,
  hardBounce: boolean = false,
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

// ---------------------------
// Simple campaign batch queue
// ---------------------------

export async function prepareCampaignAudience(campaign: Campaign) {
  if (campaign.audiencePreparedAt) {
    return campaign;
  }

  if (!campaign.contactBookId) {
    throw new Error("No contact book found for campaign");
  }

  return db.$transaction(
    async (tx) => {
      const storedCampaign = await tx.campaign.findUnique({
        where: { id: campaign.id },
      });

      if (!storedCampaign) {
        throw new Error("Campaign not found");
      }

      if (storedCampaign.audiencePreparedAt) {
        return storedCampaign;
      }

      if (!storedCampaign.contactBookId) {
        throw new Error("No contact book found for campaign");
      }

      const capturedAt = storedCampaign.audienceCapturedAt ?? new Date();

      if (!storedCampaign.audienceCapturedAt) {
        await tx.campaign.update({
          where: { id: storedCampaign.id },
          data: { audienceCapturedAt: capturedAt },
        });
      }

      await tx.$executeRaw`
        INSERT INTO "CampaignEmail" ("campaignId", "contactId", "status")
        SELECT ${storedCampaign.id}, "id", 'PENDING'::"CampaignRecipientStatus"
        FROM "Contact"
        WHERE "contactBookId" = ${storedCampaign.contactBookId}
          AND "subscribed" = true
          AND "createdAt" <= ${capturedAt}
        ON CONFLICT ("campaignId", "contactId") DO NOTHING
      `;

      const total = await tx.campaignEmail.count({
        where: { campaignId: storedCampaign.id },
      });

      const deliveryBatchSize =
        storedCampaign.deliveryMode === "GRADUAL"
          ? calculateGradualDelivery({
              audienceSize: total,
              batchPercentage: storedCampaign.deliveryBatchPercentage ?? 0,
              intervalMinutes: storedCampaign.deliveryIntervalMinutes ?? 0,
              startsAt: storedCampaign.scheduledAt ?? new Date(),
            }).batchSize
          : null;

      return tx.campaign.update({
        where: { id: storedCampaign.id },
        data: {
          total,
          audienceCapturedAt: capturedAt,
          audiencePreparedAt: new Date(),
          deliveryBatchSize,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: CAMPAIGN_AUDIENCE_PREPARATION_TIMEOUT_MS,
    },
  );
}

type GradualDeliveryWaveCampaign = Pick<
  Campaign,
  "deliveryMode" | "deliveryBatchSize" | "currentDeliveryBatch" | "total"
>;

function getGradualDeliveryWaveSize(campaign: GradualDeliveryWaveCampaign) {
  if (
    campaign.deliveryMode !== "GRADUAL" ||
    !campaign.deliveryBatchSize ||
    campaign.currentDeliveryBatch <= 0
  ) {
    return 0;
  }

  const previouslyReleased =
    (campaign.currentDeliveryBatch - 1) * campaign.deliveryBatchSize;

  return Math.max(
    0,
    Math.min(campaign.deliveryBatchSize, campaign.total - previouslyReleased),
  );
}

export async function claimCampaignRecipients(campaignId: string): Promise<{
  campaign: Campaign | null;
  recipients: ClaimedCampaignRecipient[];
}> {
  return db.$transaction(async (tx) => {
    const lockedCampaign = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Campaign"
      WHERE "id" = ${campaignId}
      FOR UPDATE
    `;

    if (lockedCampaign.length === 0) {
      return { campaign: null, recipients: [] };
    }

    let campaign = await tx.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.status !== "RUNNING") {
      return { campaign, recipients: [] };
    }

    const claimedAt = new Date();
    const staleBefore = new Date(
      claimedAt.getTime() - CAMPAIGN_RECIPIENT_CLAIM_TIMEOUT_MS,
    );
    const staleRecipients = await tx.campaignEmail.findMany({
      where: {
        campaignId,
        status: "PROCESSING",
        processedAt: { lte: staleBefore },
      },
      select: { contactId: true },
      orderBy: { contactId: "asc" },
      take: GRADUAL_DELIVERY_INTERNAL_BATCH_SIZE,
    });

    if (staleRecipients.length > 0) {
      const staleContactIds = staleRecipients.map(
        (recipient) => recipient.contactId,
      );

      await tx.campaignEmail.updateMany({
        where: {
          campaignId,
          contactId: { in: staleContactIds },
          status: "PROCESSING",
          processedAt: { lte: staleBefore },
        },
        data: { processedAt: claimedAt },
      });

      const reclaimedRecipients = await tx.campaignEmail.findMany({
        where: {
          campaignId,
          contactId: { in: staleContactIds },
          status: "PROCESSING",
          processedAt: claimedAt,
        },
        select: { contactId: true },
        orderBy: { contactId: "asc" },
      });

      return {
        campaign,
        recipients: reclaimedRecipients.map((recipient) => ({
          contactId: recipient.contactId,
          claimProcessedAt: claimedAt,
        })),
      };
    }

    const activeClaims = await tx.campaignEmail.count({
      where: { campaignId, status: "PROCESSING" },
    });

    if (activeClaims > 0) {
      return { campaign, recipients: [] };
    }

    let take = campaign.batchSize ?? 500;
    let currentWaveSize = 0;
    let deliveryIntervalMinutes = 0;

    if (campaign.deliveryMode === "GRADUAL") {
      if (!campaign.deliveryBatchSize || !campaign.deliveryIntervalMinutes) {
        throw new Error("Gradual delivery configuration is incomplete");
      }

      const deliveryBatchSize = campaign.deliveryBatchSize;
      deliveryIntervalMinutes = campaign.deliveryIntervalMinutes;
      currentWaveSize = getGradualDeliveryWaveSize(campaign);

      if (campaign.currentDeliveryBatch === 0) {
        campaign = await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            currentDeliveryBatch: 1,
            deliveryBatchProcessed: 0,
            nextDeliveryAt: null,
          },
        });
        currentWaveSize = getGradualDeliveryWaveSize(campaign);
      } else if (campaign.deliveryBatchProcessed >= currentWaveSize) {
        const allWavesReleased =
          campaign.currentDeliveryBatch * deliveryBatchSize >= campaign.total;

        if (allWavesReleased) {
          return { campaign, recipients: [] };
        }

        if (
          campaign.nextDeliveryAt &&
          campaign.nextDeliveryAt.getTime() > claimedAt.getTime()
        ) {
          return { campaign, recipients: [] };
        }

        campaign = await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            currentDeliveryBatch: { increment: 1 },
            deliveryBatchProcessed: 0,
            nextDeliveryAt: null,
          },
        });
        currentWaveSize = getGradualDeliveryWaveSize(campaign);
      }

      const remainingInWave = Math.max(
        0,
        currentWaveSize - campaign.deliveryBatchProcessed,
      );
      take = Math.min(GRADUAL_DELIVERY_INTERNAL_BATCH_SIZE, remainingInWave);
    }

    if (take === 0) {
      return { campaign, recipients: [] };
    }

    const pendingRecipients = await tx.campaignEmail.findMany({
      where: { campaignId, status: "PENDING" },
      select: { contactId: true },
      orderBy: { contactId: "asc" },
      take,
    });

    if (pendingRecipients.length === 0) {
      return { campaign, recipients: [] };
    }

    const pendingContactIds = pendingRecipients.map(
      (recipient) => recipient.contactId,
    );

    await tx.campaignEmail.updateMany({
      where: {
        campaignId,
        contactId: { in: pendingContactIds },
        status: "PENDING",
      },
      data: { status: "PROCESSING", processedAt: claimedAt },
    });

    const claimedRecipients = await tx.campaignEmail.findMany({
      where: {
        campaignId,
        contactId: { in: pendingContactIds },
        status: "PROCESSING",
        processedAt: claimedAt,
      },
      select: { contactId: true },
      orderBy: { contactId: "asc" },
    });

    if (campaign.deliveryMode === "GRADUAL" && claimedRecipients.length > 0) {
      const updatedDeliveryBatchProcessed =
        campaign.deliveryBatchProcessed + claimedRecipients.length;

      campaign = await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          deliveryBatchProcessed: { increment: claimedRecipients.length },
          ...(updatedDeliveryBatchProcessed >= currentWaveSize
            ? {
                nextDeliveryAt: new Date(
                  claimedAt.getTime() + deliveryIntervalMinutes * 60 * 1000,
                ),
              }
            : {}),
        },
      });
    }

    return {
      campaign,
      recipients: claimedRecipients.map((recipient) => ({
        contactId: recipient.contactId,
        claimProcessedAt: claimedAt,
      })),
    };
  });
}

export async function startCampaignIfDue(
  campaignId: string,
  now: Date = new Date(),
) {
  const started = await db.campaign.updateMany({
    where: {
      id: campaignId,
      status: "SCHEDULED",
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    data: { status: "RUNNING" },
  });

  if (started.count !== 1) {
    return null;
  }

  return db.campaign.findUnique({ where: { id: campaignId } });
}

type CampaignBatchJob = TeamJob<{ campaignId: string }>;

export class CampaignBatchService {
  private static batchQueue = new Queue<CampaignBatchJob>(
    CAMPAIGN_BATCH_QUEUE,
    {
      connection: getRedis(),
      prefix: BULL_PREFIX,
      skipVersionCheck: true,
    },
  );

  static worker = new Worker(
    CAMPAIGN_BATCH_QUEUE,
    createWorkerHandler(async (job: CampaignBatchJob) => {
      const { campaignId } = job.data;

      let campaign = await db.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) return;
      if (!campaign.contactBookId) return;
      const contactBookId = campaign.contactBookId;

      // Skip paused campaigns
      if (campaign.status === "PAUSED") return;

      // Atomically start only if the campaign is still scheduled and due. This
      // prevents a stale worker from overriding a concurrent reschedule.
      if (campaign.status === "SCHEDULED") {
        const startedCampaign = await startCampaignIfDue(campaignId);
        if (!startedCampaign) return;
        campaign = startedCampaign;
      }

      if (campaign.status !== "RUNNING") return;

      campaign = await prepareCampaignAudience(campaign);

      if (campaign.total === 0) {
        await db.campaign.update({
          where: { id: campaignId },
          data: { status: "SENT" },
        });
        return;
      }

      const domain = await db.domain.findUnique({
        where: { id: campaign.domainId },
      });
      if (!domain) return;

      const claim = await claimCampaignRecipients(campaignId);
      campaign = claim.campaign ?? campaign;
      const recipients = claim.recipients;

      if (recipients.length === 0) {
        const outstandingRecipients = await db.campaignEmail.count({
          where: {
            campaignId,
            status: { in: ["PENDING", "PROCESSING"] },
          },
        });

        if (outstandingRecipients === 0) {
          await db.campaign.update({
            where: { id: campaignId },
            data: { status: "SENT", nextDeliveryAt: null },
          });
        }
        return;
      }

      const contacts = await db.contact.findMany({
        where: {
          id: { in: recipients.map((recipient) => recipient.contactId) },
        },
      });
      const contactsById = new Map(
        contacts.map((contact) => [contact.id, contact]),
      );

      const contactBook = await db.contactBook.findUnique({
        where: { id: contactBookId },
        select: { variables: true },
      });

      const allowedVariables = [
        ...BUILT_IN_CONTACT_VARIABLES,
        ...(contactBook?.variables ?? []),
      ];

      // Process each contact in this batch
      for (const recipient of recipients) {
        const contact = contactsById.get(recipient.contactId);

        if (!contact || !contact.subscribed) {
          await db.campaignEmail.updateMany({
            where: {
              campaignId,
              contactId: recipient.contactId,
              status: "PROCESSING",
              processedAt: recipient.claimProcessedAt,
            },
            data: { status: "SKIPPED", processedAt: new Date() },
          });
          continue;
        }

        try {
          await processContactEmail({
            contact,
            campaign,
            claimProcessedAt: recipient.claimProcessedAt,
            allowedVariables,
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
        } catch (err) {
          logger.error(
            { err, contactId: contact.id, campaignId },
            "Failed to process contact; skipping to next",
          );
          try {
            await recordCampaignContactFailure({
              contact,
              campaign,
              claimProcessedAt: recipient.claimProcessedAt,
              emailConfig: {
                replyTo: Array.isArray(campaign.replyTo)
                  ? campaign.replyTo
                  : [],
                cc: Array.isArray(campaign.cc) ? campaign.cc : [],
                bcc: Array.isArray(campaign.bcc) ? campaign.bcc : [],
                teamId: campaign.teamId,
                domainId: domain.id,
              },
              error: err,
            });
          } catch (recordErr) {
            logger.error(
              { err: recordErr, contactId: contact.id, campaignId },
              "Failed to record campaign contact failure; skipping to next",
            );
          }
          continue;
        }
      }

      await db.campaign.update({
        where: { id: campaignId },
        data: { lastSentAt: new Date() },
      });

      const outstandingRecipients = await db.campaignEmail.count({
        where: {
          campaignId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });

      if (outstandingRecipients === 0) {
        await db.campaign.update({
          where: { id: campaignId },
          data: { status: "SENT", nextDeliveryAt: null },
        });
      }
    }),
    {
      connection: getRedis(),
      concurrency: 20,
      prefix: BULL_PREFIX,
      skipVersionCheck: true,
    },
  );

  static async queueBatch({
    campaignId,
    teamId,
  }: {
    campaignId: string;
    teamId?: number;
  }) {
    // Defensive check: avoid enqueue if window not elapsed (scheduler already enforces)
    try {
      const campaign = await db.campaign.findUnique({
        where: { id: campaignId },
        select: {
          lastSentAt: true,
          batchWindowMinutes: true,
          status: true,
          total: true,
          deliveryMode: true,
          deliveryBatchSize: true,
          currentDeliveryBatch: true,
          deliveryBatchProcessed: true,
          nextDeliveryAt: true,
        },
      });
      if (!campaign) return;
      if (campaign.status === "PAUSED" || campaign.status === "SENT") return;

      if (
        campaign.deliveryMode === "GRADUAL" &&
        campaign.deliveryBatchSize &&
        campaign.currentDeliveryBatch > 0
      ) {
        const currentWaveSize = getGradualDeliveryWaveSize(campaign);
        const currentWaveComplete =
          campaign.deliveryBatchProcessed >= currentWaveSize;

        if (
          currentWaveComplete &&
          campaign.nextDeliveryAt &&
          campaign.nextDeliveryAt.getTime() > Date.now()
        ) {
          return;
        }
      }

      const windowMin = campaign.batchWindowMinutes ?? 0;
      if (windowMin > 0 && campaign.lastSentAt) {
        const elapsedMs = Date.now() - new Date(campaign.lastSentAt).getTime();
        const windowMs = windowMin * 60 * 1000;
        if (elapsedMs < windowMs) {
          logger.debug(
            { campaignId, remainingMs: windowMs - elapsedMs },
            "Defensive skip enqueue; window not elapsed",
          );
          return;
        }
      }
    } catch (err) {
      logger.warn(
        { err, campaignId },
        "Failed defensive window check; proceeding to enqueue",
      );
    }

    await this.batchQueue.add(
      `campaign-${campaignId}`,
      { campaignId, teamId },
      {
        jobId: `campaign-batch-${campaignId}`,
        ...DEFAULT_QUEUE_OPTIONS,
        removeOnFail: true,
      },
    );
  }
}
