import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { parseSesHook, SesHookParser } from "~/server/service/ses-hook-parser";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import { SnsNotificationMessage } from "~/types/aws-types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ data: "Hello" });
}

export async function POST(req: Request) {
  const data = await req.json();

  logger.info(
    {
      snsMessageId: data.MessageId,
      snsType: data.Type,
      topicArn: data.TopicArn,
    },
    "[SesCallback]: Received an SNS notification",
  );

  const isEventValid = await checkEventValidity(data);

  if (!isEventValid) {
    logger.warn(
      { snsMessageId: data.MessageId, topicArn: data.TopicArn },
      "[SesCallback]: Dropped the SES event because the topic is not configured",
    );
    return Response.json({ data: "Event is not valid" });
  }

  if (data.Type === "SubscriptionConfirmation") {
    return handleSubscription(data);
  }

  try {
    const message = JSON.parse(data.Message || "{}");
    const status = await SesHookParser.queue({
      event: message,
      messageId: data.MessageId,
    });
    if (!status) {
      return Response.json({ data: "Error in parsing hook" });
    }

    return Response.json({ data: "Success" });
  } catch (e) {
    logger.error(
      { err: e, snsMessageId: data.MessageId, topicArn: data.TopicArn },
      "[SesCallback]: Failed to queue the SES event",
    );
    return Response.json({ data: "Error is parsing hook" });
  }
}

/**
 * Handles the subscription confirmation event. called only once for a webhook
 */
async function handleSubscription(message: any) {
  const topicArn = message.TopicArn as string;

  const confirmResponse = await fetch(message.SubscribeURL, {
    method: "GET",
  });

  if (!confirmResponse.ok) {
    logger.error(
      { status: confirmResponse.status, topicArn },
      "[SesCallback]: SNS subscription confirmation returned a non-success status",
    );
  }

  const setting = await db.sesSetting.findFirst({
    where: {
      topicArn,
    },
  });

  if (!setting) {
    logger.warn(
      { topicArn },
      "[SesCallback]: No SES setting matches the confirmed topic ARN",
    );
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
