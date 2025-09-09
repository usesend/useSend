import {
  EmailStatus,
  Prisma,
  UnsubscribeReason,
  SuppressionReason,
} from "@prisma/client";
import {
  SesBounce,
  SesClick,
  SesEvent,
  SesEventDataKey,
} from "~/types/aws-types";
import { db } from "../db";
import {
  unsubscribeContact,
  updateCampaignAnalytics,
} from "./campaign-service";
import { env } from "~/env";
import { getRedis } from "../redis";
import { Queue, Worker } from "bullmq";
import {
  DEFAULT_QUEUE_OPTIONS,
  SES_WEBHOOK_QUEUE,
} from "../queue/queue-constants";
import { getChildLogger, logger, withLogger } from "../logger/log";
import { randomUUID } from "crypto";
import { SuppressionService } from "./suppression-service";

export async function parseSesHook(data: SesEvent) {
  const mailStatus = getEmailStatus(data);

  if (!mailStatus) {
    logger.error({ data }, "Unknown email status");
    return false;
  }

  const sesEmailId = data.mail.messageId;

  const mailData = getEmailData(data);

  logger.setBindings({
    sesEmailId,
  });

  logger.info({ mailStatus }, "Parsing ses hook");

  let email = await db.email.findUnique({
    where: {
      sesEmailId,
    },
  });

  // Handle race condition: If email not found by sesEmailId, try to find by custom header
  if (!email) {
    const emailIdHeader = data.mail.headers.find(
      (h) => h.name === "X-Usesend-Email-ID" || h.name === "X-Unsend-Email-ID",
    );

    if (emailIdHeader?.value) {
      email = await db.email.findUnique({
        where: {
          id: emailIdHeader.value,
        },
      });

      // If found, update the sesEmailId to fix the missing reference
      if (email) {
        await db.email.update({
          where: { id: email.id },
          data: { sesEmailId },
        });
        logger.info(
          { emailId: email.id, sesEmailId },
          "Updated email with sesEmailId from webhook (race condition resolved)",
        );
      }
    }
  }

  logger.setBindings({
    sesEmailId,
    mailId: email?.id,
    teamId: email?.teamId,
  });

  if (!email) {
    logger.error({ data }, "Email not found");
    return false;
  }

  if (
    email.latestStatus === mailStatus &&
    mailStatus === EmailStatus.DELIVERY_DELAYED
  ) {
    return true;
  }

  // Update the latest status and to avoid race conditions
  await db.$executeRaw`
      UPDATE "Email"
      SET "latestStatus" = CASE
        WHEN ${mailStatus}::text::\"EmailStatus\" > "latestStatus" OR "latestStatus" IS NULL OR "latestStatus" = 'SCHEDULED'::\"EmailStatus\"
        THEN ${mailStatus}::text::\"EmailStatus\"
        ELSE "latestStatus"
      END
      WHERE id = ${email.id}
    `;

  logger.info("Latest status updated");

  // Update daily email usage statistics
  const today = new Date().toISOString().split("T")[0] as string; // Format: YYYY-MM-DD

  const isHardBounced =
    mailStatus === EmailStatus.BOUNCED &&
    (mailData as SesBounce).bounceType === "Permanent";

  // Add emails to suppression list for hard bounces and complaints
  if (isHardBounced || mailStatus === EmailStatus.COMPLAINED) {
    logger.info("Adding emails to suppression list");

    const recipientEmails = Array.isArray(email.to) ? email.to : [email.to];

    try {
      await Promise.all(
        recipientEmails.map((recipientEmail) =>
          SuppressionService.addSuppression({
            email: recipientEmail,
            teamId: email.teamId,
            reason: isHardBounced
              ? SuppressionReason.HARD_BOUNCE
              : SuppressionReason.COMPLAINT,
            source: email.id,
          }),
        ),
      );

      logger.info(
        {
          emailId: email.id,
          recipients: recipientEmails,
          reason: isHardBounced ? "HARD_BOUNCE" : "COMPLAINT",
        },
        "Added emails to suppression list due to bounce/complaint",
      );
    } catch (error) {
      logger.error(
        {
          emailId: email.id,
          recipients: recipientEmails,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to add emails to suppression list",
      );
      // Don't throw error - continue processing the webhook
    }
  }

  if (
    [
      "DELIVERED",
      "OPENED",
      "CLICKED",
      "BOUNCED",
      "COMPLAINED",
      "SENT",
    ].includes(mailStatus)
  ) {
    logger.info("Updating daily email usage");
    const updateField = mailStatus.toLowerCase();

    await db.dailyEmailUsage.upsert({
      where: {
        teamId_domainId_date_type: {
          teamId: email.teamId,
          domainId: email.domainId ?? 0,
          date: today,
          type: email.campaignId ? "MARKETING" : "TRANSACTIONAL",
        },
      },
      create: {
        teamId: email.teamId,
        domainId: email.domainId ?? 0,
        date: today,
        type: email.campaignId ? "MARKETING" : "TRANSACTIONAL",
        delivered: updateField === "delivered" ? 1 : 0,
        opened: updateField === "opened" ? 1 : 0,
        clicked: updateField === "clicked" ? 1 : 0,
        bounced: updateField === "bounced" ? 1 : 0,
        complained: updateField === "complained" ? 1 : 0,
        sent: updateField === "sent" ? 1 : 0,
        hardBounced: isHardBounced ? 1 : 0,
      },
      update: {
        [updateField]: {
          increment: 1,
        },
        ...(isHardBounced ? { hardBounced: { increment: 1 } } : {}),
      },
    });

    if (
      isHardBounced ||
      updateField === "complained" ||
      updateField === "delivered"
    ) {
      logger.info("Updating cumulated metrics");
      const cumulatedField = isHardBounced ? "hardBounced" : updateField;
      await db.cumulatedMetrics.upsert({
        where: {
          teamId_domainId: {
            teamId: email.teamId,
            domainId: email.domainId ?? 0,
          },
        },
        update: {
          [cumulatedField]: {
            increment: BigInt(1),
          },
        },
        create: {
          teamId: email.teamId,
          domainId: email.domainId ?? 0,
          [cumulatedField]: BigInt(1),
        },
      });
    }
  }

  if (email.campaignId) {
    if (
      mailStatus !== "CLICKED" ||
      !(mailData as SesClick).link.startsWith(`${env.NEXTAUTH_URL}/unsubscribe`)
    ) {
      await checkUnsubscribe({
        contactId: email.contactId!,
        campaignId: email.campaignId,
        teamId: email.teamId,
        event: mailStatus,
        mailData: data,
      });

      const mailEvent = await db.emailEvent.findFirst({
        where: {
          emailId: email.id,
          status: mailStatus,
        },
      });

      if (!mailEvent) {
        await updateCampaignAnalytics(
          email.campaignId,
          mailStatus,
          isHardBounced,
        );
      }
    }
  }

  logger.info("Creating email event");

  await db.emailEvent.create({
    data: {
      emailId: email.id,
      status: mailStatus,
      data: mailData as any,
      teamId: email.teamId,
    },
  });

  logger.info("Email event created");

  return true;
}

async function checkUnsubscribe({
  contactId,
  campaignId,
  teamId,
  event,
  mailData,
}: {
  contactId: string;
  campaignId: string;
  teamId: number;
  event: EmailStatus;
  mailData: SesEvent;
}) {
  /**
   * If the email is bounced and the bounce type is permanent, we need to unsubscribe the contact
   * If the email is complained, we need to unsubscribe the contact
   */
  if (
    (event === EmailStatus.BOUNCED &&
      mailData.bounce?.bounceType === "Permanent") ||
    event === EmailStatus.COMPLAINED
  ) {
    const contact = await db.contact.findUnique({
      where: {
        id: contactId,
      },
    });

    if (!contact) {
      return;
    }

    const allContacts = await db.contact.findMany({
      where: {
        email: contact.email,
        contactBook: {
          teamId,
        },
      },
    });

    const allContactIds = allContacts
      .map((c) => c.id)
      .filter((c) => c !== contactId);

    await Promise.all([
      unsubscribeContact({
        contactId,
        campaignId,
        reason:
          event === EmailStatus.BOUNCED
            ? UnsubscribeReason.BOUNCED
            : UnsubscribeReason.COMPLAINED,
      }),
      ...allContactIds.map((c) =>
        unsubscribeContact({
          contactId: c,
          reason:
            event === EmailStatus.BOUNCED
              ? UnsubscribeReason.BOUNCED
              : UnsubscribeReason.COMPLAINED,
        }),
      ),
    ]);
  }
}

function getEmailStatus(data: SesEvent) {
  const { eventType } = data;

  if (eventType === "Send") {
    return EmailStatus.SENT;
  } else if (eventType === "Delivery") {
    return EmailStatus.DELIVERED;
  } else if (eventType === "Bounce") {
    return EmailStatus.BOUNCED;
  } else if (eventType === "Complaint") {
    return EmailStatus.COMPLAINED;
  } else if (eventType === "Reject") {
    return EmailStatus.REJECTED;
  } else if (eventType === "Open") {
    return EmailStatus.OPENED;
  } else if (eventType === "Click") {
    return EmailStatus.CLICKED;
  } else if (eventType === "Rendering Failure") {
    return EmailStatus.RENDERING_FAILURE;
  } else if (eventType === "DeliveryDelay") {
    return EmailStatus.DELIVERY_DELAYED;
  }
}

function getEmailData(data: SesEvent) {
  const { eventType } = data;

  if (eventType === "Rendering Failure") {
    return data.renderingFailure;
  } else if (eventType === "DeliveryDelay") {
    return data.deliveryDelay;
  } else {
    return data[eventType.toLowerCase() as SesEventDataKey];
  }
}

export class SesHookParser {
  private static sesHookQueue = new Queue(SES_WEBHOOK_QUEUE, {
    connection: getRedis(),
  });

  private static worker = new Worker(
    SES_WEBHOOK_QUEUE,
    async (job) => {
      return await withLogger(
        getChildLogger({
          queueId: job.id ?? randomUUID(),
        }),
        async () => {
          await this.execute(job.data);
        },
      );
    },
    {
      connection: getRedis(),
      concurrency: 50,
    },
  );

  private static async execute(event: SesEvent) {
    try {
      await parseSesHook(event);
    } catch (error) {
      logger.error({ error }, "Error parsing ses hook");
      throw error;
    }
  }

  static async queue(data: { event: SesEvent; messageId: string }) {
    return await this.sesHookQueue.add(
      data.messageId,
      data.event,
      DEFAULT_QUEUE_OPTIONS,
    );
  }
}
