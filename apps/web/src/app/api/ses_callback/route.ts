import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { parseSesHook, SesHookParser } from "~/server/service/ses-hook-parser";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import { SnsNotificationMessage } from "~/types/aws-types";
import { verifySnsMessageSignature } from "~/server/aws/sns-message-validator";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ data: "Hello" });
}

export async function POST(req: Request) {
  const data = await req.json();

  console.log(data, data.Message);

  const isEventValid = await checkEventValidity(data);

  console.log("Is event valid: ", isEventValid);

  if (!isEventValid) {
    return Response.json({ data: "Event is not valid" });
  }

  if (data.Type === "SubscriptionConfirmation") {
    return handleSubscription(data);
  }

  let message = null;

  try {
    message = JSON.parse(data.Message || "{}");
    const status = await SesHookParser.queue({
      event: message,
      messageId: data.MessageId
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
async function handleSubscription(message: any) {
  await fetch(message.SubscribeURL, {
    method: "GET"
  });

  const topicArn = message.TopicArn as string;
  const setting = await db.sesSetting.findFirst({
    where: {
      topicArn
    }
  });

  if (!setting) {
    return Response.json({ data: "Setting not found" });
  }

  await db.sesSetting.update({
    where: {
      id: setting?.id
    },
    data: {
      callbackSuccess: true
    }
  });

  SesSettingsService.invalidateCache();

  return Response.json({ data: "Success" });
}

/**
 * A simple check to ensure that the event is from the correct topic and has a valid signature
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

  // Verify the SNS message signature
  const isSignatureValid = await verifySnsMessageSignature(message);
  if (!isSignatureValid) {
    logger.error({
      topicArn: TopicArn,
      msg: "Rejected SNS message with invalid signature"
    });
    return false;
  }

  return true;
}
