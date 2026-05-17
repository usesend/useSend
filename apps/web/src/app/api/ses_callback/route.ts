import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { SesHookParser } from "~/server/service/ses-hook-parser";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import { SesEvent, SnsNotificationMessage } from "~/types/aws-types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ data: "Hello" });
}

export async function POST(req: Request) {
  const data = await req.json();

  logger.info({ type: data?.Type, messageId: data?.MessageId }, "Received SNS callback");

  const isEventValid = await checkEventValidity(data);

  logger.info({ isEventValid, topicArn: data?.TopicArn }, "SNS callback validation result");

  if (!isEventValid) {
    return Response.json({ data: "Event is not valid" });
  }

  if (data.Type === "SubscriptionConfirmation") {
    return handleSubscription(data);
  }

  try {
    const rawMessage = data?.Message;
    if (typeof rawMessage !== "string" || rawMessage.trim() === "") {
      logger.warn({ messageId: data?.MessageId }, "SNS callback without message payload");
      return Response.json({ data: "Ignored non-SES callback message" });
    }

    let message: unknown;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      logger.info(
        { messageId: data?.MessageId, rawMessage },
        "Ignoring SNS notification with non-JSON payload",
      );
      return Response.json({ data: "Ignored non-SES callback message" });
    }

    if (!isSesEventPayload(message)) {
      logger.info(
        { messageId: data?.MessageId },
        "Ignoring SNS notification that is not an SES event payload",
      );
      return Response.json({ data: "Ignored non-SES callback message" });
    }

    const status = await SesHookParser.queue({
      event: message,
      messageId: data.MessageId,
    });
    if (!status) {
      return Response.json({ data: "Error in parsing hook" });
    }

    return Response.json({ data: "Success" });
  } catch (e) {
    logger.error({ err: e, messageId: data?.MessageId }, "Failed to process SES callback");
    return Response.json({ data: "Error is parsing hook" });
  }
}

function isSesEventPayload(value: unknown): value is SesEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<SesEvent>;
  return typeof event.eventType === "string" && !!event.mail;
}

/**
 * Handles the subscription confirmation event. called only once for a webhook
 */
async function handleSubscription(message: any) {
  await fetch(message.SubscribeURL, {
    method: "GET",
  });

  const topicArn = message.TopicArn as string;
  const setting = await db.sesSetting.findFirst({
    where: {
      topicArn,
    },
  });

  if (!setting) {
    return Response.json({ data: "Setting not found" });
  }

  await db.sesSetting.update({
    where: {
      id: setting?.id,
    },
    data: {
      callbackSuccess: true,
    },
  });

  SesSettingsService.invalidateCache();

  return Response.json({ data: "Success" });
}

/**
 * A simple check to ensure that the event is from the correct topic
 */
async function checkEventValidity(message: SnsNotificationMessage) {
  if (env.NODE_ENV === "development") {
    return true;
  }

  const { TopicArn } = message;
  const configuredTopicArn = await SesSettingsService.getTopicArns();

  if (!configuredTopicArn.includes(TopicArn)) {
    return false;
  }

  return true;
}
