import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import {
  isTrustedSnsUrl,
  verifySnsMessageSignature,
} from "~/server/aws/sns-message-validator";
import { SesHookParser } from "~/server/service/ses-hook-parser";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import { SnsNotificationMessage } from "~/types/aws-types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ data: "Hello" });
}

export async function POST(req: Request) {
  let data: SnsNotificationMessage;

  try {
    data = (await req.json()) as SnsNotificationMessage;
  } catch {
    return Response.json({ data: "Invalid payload" }, { status: 400 });
  }

  const isEventValid = await checkEventValidity(data);

  if (!isEventValid) {
    return Response.json({ data: "Event is not valid" }, { status: 401 });
  }

  if (data.Type === "SubscriptionConfirmation") {
    return handleSubscription(data);
  }

  let message = null;

  try {
    message = JSON.parse(data.Message || "{}");
    const status = await SesHookParser.queue({
      event: message,
      messageId: data.MessageId,
    });
    if (!status) {
      return Response.json({ data: "Error in parsing hook" });
    }

    return Response.json({ data: "Success" });
  } catch (e) {
    console.error(e);
    return Response.json({ data: "Error is parsing hook" });
  }
}

/**
 * Handles the subscription confirmation event. called only once for a webhook
 */
async function handleSubscription(message: SnsNotificationMessage) {
  const subscribeUrl = message.SubscribeURL;

  if (!subscribeUrl || !isTrustedSnsUrl(subscribeUrl, message.TopicArn)) {
    logger.warn({ subscribeUrl }, "Rejected untrusted SNS SubscribeURL");
    return Response.json({ data: "Invalid subscription URL" }, { status: 400 });
  }

  await fetch(subscribeUrl, {
    method: "GET",
    // Do not follow redirects: the confirmation URL must be the AWS SNS host.
    redirect: "error",
  });

  const topicArn = message.TopicArn;
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
 * Checks that the event is from a configured topic and that its AWS SNS
 * signature is valid before the payload is trusted.
 */
async function checkEventValidity(
  message: SnsNotificationMessage
): Promise<boolean> {
  if (env.NODE_ENV === "development") {
    return true;
  }

  const { TopicArn } = message;
  const configuredTopicArn = await SesSettingsService.getTopicArns();

  if (!configuredTopicArn.includes(TopicArn)) {
    return false;
  }

  return verifySnsMessageSignature(message);
}
