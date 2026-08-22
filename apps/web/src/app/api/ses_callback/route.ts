import { db } from "~/server/db";
import { SesHookParser } from "~/server/service/ses-hook-parser";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import {
  isSnsNotificationMessage,
  isTrustedSnsSubscriptionUrl,
  verifySnsMessageSignature,
} from "~/server/security/sns-message-validator";
import type { SnsNotificationMessage } from "~/types/aws-types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ data: "Hello" });
}

export async function POST(req: Request) {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return Response.json({ data: "Invalid JSON" }, { status: 400 });
  }

  if (!isSnsNotificationMessage(data)) {
    return Response.json({ data: "Event is not valid" }, { status: 401 });
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
  if (
    !message.SubscribeURL ||
    !isTrustedSnsSubscriptionUrl(message.SubscribeURL, message.TopicArn)
  ) {
    return Response.json(
      { data: "Subscription URL is not valid" },
      { status: 400 },
    );
  }

  await fetch(message.SubscribeURL, {
    method: "GET",
    redirect: "error",
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
 * Ensure the event is signed by SNS and belongs to a configured topic.
 */
async function checkEventValidity(message: SnsNotificationMessage) {
  const configuredTopicArn = await SesSettingsService.getTopicArns();

  if (!configuredTopicArn.includes(message.TopicArn)) {
    return false;
  }

  return verifySnsMessageSignature(message);
}
