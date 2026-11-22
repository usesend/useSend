import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import { db } from "../db";
import { createHash } from "crypto";
import { env } from "~/env";
import {
  Campaign,
  Contact,
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
import { requeueJob } from "../queue/requeue-job";
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
  GUARD_ACTOR,
  GuardConflictError,
  GuardNotFoundError,
  assertGuardMayAct,
  campaignContentHash,
  isReviewHeld,
  reviewBody,
  reviewHoldFor,
} from "~/server/service/guard-service";
import type { z } from "zod";

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
  const reviewHoldUntil = await reviewHoldFor(campaign.teamId);
  const scheduledAt = campaign.scheduledAt ?? new Date();
  const lastCursor = campaign.lastCursor ?? null;
  await db.$transaction(async (tx) => {
    await lockTeamAndCheckNotStopped(tx, campaign.teamId, id);
    await tx.campaign.update({
      where: { id },
      data: {
        status: "SCHEDULED",
        total,
        scheduledAt,
        lastCursor,
        reviewHoldUntil,
      },
    });
  });

  // Sending is an explicit choice: clear a batch that failed long ago, so the
  // scheduler doesn't pause the campaign because of it (after the update, as
  // in scheduleCampaign).
  await CampaignBatchService.clearFailedBatch(id);

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
}: {
  campaignId: string;
  teamId: number;
  scheduledAt?: Date | string;
  batchSize?: number;
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

  const shouldResetCursor =
    campaign.status === "DRAFT" || campaign.status === "SENT";

  // New teams' campaigns wait for the Guard's check (sends anyway later).
  const reviewHoldUntil = await reviewHoldFor(teamId);
  await db.$transaction(async (tx) => {
    await lockTeamAndCheckNotStopped(tx, teamId, campaignId);
    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        status: "SCHEDULED",
        scheduledAt,
        total,
        ...(batchSize ? { batchSize } : {}),
        ...(shouldResetCursor ? { lastCursor: null } : {}),
        reviewHoldUntil,
      },
    });
  });

  // Scheduling is an explicit choice: clear a batch that failed long ago, so
  // the scheduler doesn't pause the campaign because of it. This runs after the
  // new schedule is saved, so the scheduler can't start an early batch in
  // between. If it fails, the worst case is the campaign gets paused, not sent.
  await CampaignBatchService.clearFailedBatch(campaign.id);

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

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "PAUSED" },
  });

  return { ok: true };
}

function campaignUnderReviewError() {
  return new UnsendApiError({
    code: "FORBIDDEN",
    message:
      "Our team is reviewing this campaign. Write to hey@usesend.com if you have questions.",
  });
}

/**
 * Takes the Team row lock (the one pausing, blocking and the Guard take) and
 * refuses a campaign the Guard stopped. Every change that sets a campaign
 * sending runs this first, in the same transaction.
 */
async function lockTeamAndCheckNotStopped(
  tx: Prisma.TransactionClient,
  teamId: number,
  campaignId: string,
) {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
  const current = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: { guardStoppedAt: true },
  });
  if (current?.guardStoppedAt) throw campaignUnderReviewError();
}

async function assertTeamCanSend(
  client: Pick<typeof db, "team">,
  teamId: number,
) {
  const team = await client.team.findUnique({
    where: { id: teamId },
    select: { isBlocked: true, sendingPausedAt: true },
  });
  if (team?.isBlocked || team?.sendingPausedAt) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: "Sending is paused on your account, so campaigns can't resume",
    });
  }
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

  await assertTeamCanSend(db, teamId);

  if (campaign.guardStoppedAt) throw campaignUnderReviewError();

  const reviewHoldUntil = await reviewHoldFor(teamId);

  // Resuming is an explicit choice, so it also clears a batch that failed long
  // ago and that the scheduler no longer retries on its own.
  await CampaignBatchService.clearFailedBatch(campaignId);

  const status =
    campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()
      ? "SCHEDULED"
      : "RUNNING";

  // Check again and write the status under the team row lock that pausing and
  // blocking take, so a pause landing in between can't be overwritten.
  await db.$transaction(async (tx) => {
    await lockTeamAndCheckNotStopped(tx, teamId, campaignId);
    await assertTeamCanSend(tx, teamId);
    await tx.campaign.update({
      where: { id: campaignId },
      data: { status, reviewHoldUntil },
    });
  });

  return { ok: true };
}

/**
 * The Guard's decision on a campaign.
 * - stop: pauses a sending campaign and marks it stopped (new teams only).
 *   Nothing can set it sending again until the Guard approves it.
 * - approve: must name the content fingerprint the Guard reviewed. Lets a
 *   waiting campaign send now, or restarts one the Guard stopped.
 * Both take the Team row lock and re-read the campaign under it.
 */
export async function guardReviewCampaign(
  campaignId: string,
  body: z.infer<typeof reviewBody>,
) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      teamId: true,
      name: true,
      status: true,
      guardStoppedAt: true,
      reviewHoldUntil: true,
      team: { select: { createdAt: true } },
    },
  });
  if (!campaign) throw new GuardNotFoundError("Campaign not found");
  const { teamId } = campaign;

  if (body.decision === "stop") {
    assertGuardMayAct(campaign.team);
    const stopped = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
      const { count } = await tx.campaign.updateMany({
        where: { id: campaignId, status: { in: ["SCHEDULED", "RUNNING"] } },
        data: {
          status: "PAUSED",
          reviewHoldUntil: null,
          guardStoppedAt: new Date(),
        },
      });
      if (count === 0) return false;
      await tx.teamAction.create({
        data: {
          teamId,
          action: "PAUSE",
          actor: GUARD_ACTOR,
          reason: `Stopped campaign "${campaign.name}": ${body.reason}`,
          details: { scope: "campaign", campaignId, source: GUARD_ACTOR },
        },
      });
      return true;
    });
    if (!stopped) {
      throw new GuardConflictError(
        `Campaign is ${campaign.status.toLowerCase()}, not sending`,
      );
    }
    return { ok: true, status: "PAUSED" };
  }

  // Approve. Nothing to do for a campaign that isn't waiting or stopped.
  if (!campaign.guardStoppedAt && !isReviewHeld(campaign)) {
    return { ok: true, status: campaign.status };
  }

  if (campaign.guardStoppedAt) {
    // As in resume and schedule: an explicit restart clears a batch that
    // failed long ago, so the scheduler doesn't pause it again for that.
    await CampaignBatchService.clearFailedBatch(campaignId);
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
    const current = await tx.campaign.findUnique({
      where: { id: campaignId },
      select: {
        status: true,
        updatedAt: true,
        guardStoppedAt: true,
        from: true,
        replyTo: true,
        subject: true,
        previewText: true,
        html: true,
        content: true,
      },
    });
    if (!current) throw new GuardNotFoundError("Campaign not found");
    // Stopped since it was first read: its old failed batch wasn't cleared.
    if (current.guardStoppedAt && !campaign.guardStoppedAt) {
      throw new GuardConflictError(
        "The campaign was stopped meanwhile; review it again",
      );
    }
    if (campaignContentHash(current) !== body.contentHash) {
      throw new GuardConflictError(
        "The campaign changed since it was reviewed; review it again",
      );
    }

    if (current.guardStoppedAt) {
      const team = await tx.team.findUnique({
        where: { id: teamId },
        select: { isBlocked: true, sendingPausedAt: true },
      });
      if (team?.isBlocked || team?.sendingPausedAt) {
        throw new GuardConflictError(
          "The team is paused or blocked; resume the team first",
        );
      }
    }

    // Only if nothing changed since the read above (an edit sets a new hold).
    const { count } = await tx.campaign.updateMany({
      where: { id: campaignId, updatedAt: current.updatedAt },
      data: current.guardStoppedAt
        ? { status: "SCHEDULED", guardStoppedAt: null, reviewHoldUntil: null }
        : { reviewHoldUntil: null },
    });
    if (count === 0) {
      throw new GuardConflictError(
        "The campaign changed since it was reviewed; review it again",
      );
    }
    return {
      ok: true,
      status: current.guardStoppedAt ? "SCHEDULED" : current.status,
    };
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
      select: { emailId: true },
    });

    let emailId = existingCampaignEmail?.emailId;

    if (!emailId) {
      const existingEmail = await tx.email.findFirst({
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

      await tx.campaignEmail.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          emailId,
        },
      });
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

async function processContactEmail(jobData: CampaignEmailJob) {
  const { contact, campaign, emailConfig, allowedVariables } = jobData;

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

    const email = await db.email.create({
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

    await db.campaignEmail.create({
      data: {
        campaignId: emailConfig.campaignId,
        contactId: contact.id,
        emailId: email.id,
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

  // Create email with filtered recipients
  const email = await db.email.create({
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

  await db.campaignEmail.create({
    data: {
      campaignId: emailConfig.campaignId,
      contactId: contact.id,
      emailId: email.id,
    },
  });

  // Queue email for sending
  await EmailQueueService.queueEmail(
    email.id,
    emailConfig.teamId,
    emailConfig.region,
    false,
    oneClickUnsubUrl,
  );
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

type CampaignBatchJob = TeamJob<{ campaignId: string }>;

// A failed batch is retried by the scheduler after a short wait, so a batch
// that keeps failing doesn't run on every 1.5s scheduler tick.
const CAMPAIGN_BATCH_RETRY_AFTER_MS = 60 * 1000;
// A batch that failed longer ago than this is not retried automatically, so an
// old campaign never starts sending again by surprise: the campaign is paused
// instead, and its owner can resume it.
const CAMPAIGN_BATCH_MAX_AUTO_RETRY_AGE_MS = 24 * 60 * 60 * 1000;

const campaignBatchJobId = (campaignId: string) =>
  `campaign-batch-${campaignId}`;

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

      const campaign = await db.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) return;
      if (!campaign.contactBookId) return;

      // Skip paused campaigns, and ones the Guard stopped
      if (campaign.status === "PAUSED" || campaign.guardStoppedAt) return;

      // A new team's campaign waits for the Guard's check, for a few minutes
      // at most; the scheduler queues it again on its next tick.
      if (isReviewHeld(campaign)) return;

      // Respect scheduledAt if set
      if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now())
        return;

      // First touch moves SCHEDULED -> RUNNING, only if nothing paused or
      // stopped it since it was read above.
      if (campaign.status === "SCHEDULED") {
        const now = new Date();
        const { count } = await db.campaign.updateMany({
          where: {
            id: campaignId,
            status: "SCHEDULED",
            guardStoppedAt: null,
            OR: [{ reviewHoldUntil: null }, { reviewHoldUntil: { lte: now } }],
          },
          data: { status: "RUNNING" },
        });
        if (count === 0) {
          const current = await db.campaign.findUnique({
            where: { id: campaignId },
            select: {
              status: true,
              guardStoppedAt: true,
              reviewHoldUntil: true,
            },
          });
          if (
            current?.status !== "RUNNING" ||
            current.guardStoppedAt ||
            isReviewHeld(current)
          ) {
            return;
          }
        }
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

      const contactBook = await db.contactBook.findUnique({
        where: { id: campaign.contactBookId },
        select: { variables: true },
      });

      const allowedVariables = [
        ...BUILT_IN_CONTACT_VARIABLES,
        ...(contactBook?.variables ?? []),
      ];

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
      const existing = await db.campaignEmail.findMany({
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

        try {
          await processContactEmail({
            contact,
            campaign,
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
        }
      }

      // Advance cursor and timestamp
      const newCursor = contacts[contacts.length - 1]?.id;
      await db.campaign.update({
        where: { id: campaignId },
        data: { lastCursor: newCursor, lastSentAt: new Date() },
      });
    }),
    {
      connection: getRedis(),
      concurrency: 20,
      prefix: BULL_PREFIX,
      skipVersionCheck: true,
    },
  );

  static {
    this.worker.on("failed", (job, err) => {
      logger.error(
        { err, campaignId: job?.data?.campaignId, jobId: job?.id },
        "[CampaignBatchService]: Campaign batch failed; the scheduler retries it after a minute if the campaign is still running",
      );
    });
  }

  static async hasFailedBatch(campaignId: string) {
    const job = await this.batchQueue.getJob(campaignBatchJobId(campaignId));
    return Boolean(job && (await job.isFailed()));
  }

  /** Removes a kept failed batch job for a campaign, if there is one. */
  static async clearFailedBatch(campaignId: string) {
    const job = await this.batchQueue.getJob(campaignBatchJobId(campaignId));
    if (job && (await job.isFailed())) {
      await job.remove();
      logger.info(
        { campaignId },
        "[CampaignBatchService]: Cleared a failed batch on resume",
      );
    }
  }

  static async queueBatch({
    campaignId,
    teamId,
  }: {
    campaignId: string;
    teamId?: number;
  }) {
    // When the campaign was last changed, read before looking at the queue.
    // Pausing below only applies if updatedAt is unchanged since, an optimistic
    // guard against undoing a resume or reschedule made at the same moment.
    let seenUpdatedAt: Date | undefined;

    // Defensive check: avoid enqueue if window not elapsed (scheduler already enforces)
    try {
      const campaign = await db.campaign.findUnique({
        where: { id: campaignId },
        select: {
          lastSentAt: true,
          batchWindowMinutes: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!campaign) return;
      seenUpdatedAt = campaign.updatedAt;
      if (campaign.status === "PAUSED" || campaign.status === "SENT") return;
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

    // A plain add() would do nothing after a failed batch: BullMQ keeps the
    // failed job under this fixed id for 30 days, and the campaign would stop.
    const result = await requeueJob(
      this.batchQueue,
      `campaign-${campaignId}`,
      { campaignId, teamId },
      { jobId: campaignBatchJobId(campaignId), ...DEFAULT_QUEUE_OPTIONS },
      {
        retryFailedAfterMs: CAMPAIGN_BATCH_RETRY_AFTER_MS,
        maxFailedAgeMs: CAMPAIGN_BATCH_MAX_AUTO_RETRY_AGE_MS,
      },
    );

    if (result === "retried") {
      logger.warn(
        { campaignId },
        "[CampaignBatchService]: Retrying a failed campaign batch",
      );
    }

    if (
      result === "failed-too-long-ago" &&
      seenUpdatedAt &&
      // Check again right before pausing: resume, schedule and send clear the
      // failed batch, and that must win. (A clear landing in the moment between
      // this check and the update below can still pause the campaign; that is
      // safe, as nothing is sent, and the owner can resume it.)
      (await this.hasFailedBatch(campaignId))
    ) {
      // Pause in the database, not just skip: BullMQ deletes the failed job
      // after 30 days, and the campaign would then restart on the next tick.
      // The updatedAt check guards against undoing a resume or reschedule
      // made while we were looking at the queue.
      const paused = await db.campaign.updateMany({
        where: {
          id: campaignId,
          status: { in: ["SCHEDULED", "RUNNING"] },
          updatedAt: seenUpdatedAt,
        },
        data: { status: "PAUSED" },
      });
      if (paused.count > 0) {
        logger.warn(
          { campaignId },
          "[CampaignBatchService]: Paused a campaign whose batch failed over a day ago; resume it to continue",
        );
      }
    }
  }
}
