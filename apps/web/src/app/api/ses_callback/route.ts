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

  if (!subscribeUrl || !isAllowedSubscribeUrl(subscribeUrl, message.TopicArn)) {
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

function isSignatureEnforced() {
  return (
    env.NODE_ENV !== "development" &&
    env.SNS_SIGNATURE_VERIFICATION !== "log-only"
  );
}

/**
 * AWS always sends an https SubscribeURL on its own SNS host. A custom SNS
 * endpoint (an emulator such as local-ses-sns, or LocalStack) sends its own
 * URL instead, so that is only trusted when the operator has pointed
 * AWS_SNS_ENDPOINT elsewhere and turned off signature enforcement.
 */
function isAllowedSubscribeUrl(subscribeUrl: string, topicArn: string) {
  if (isTrustedSnsUrl(subscribeUrl, topicArn)) {
    return true;
  }

  if (!env.AWS_SNS_ENDPOINT || isSignatureEnforced()) {
    return false;
  }

  try {
    const { protocol } = new URL(subscribeUrl);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Checks that the event is from a configured topic and that its AWS SNS
 * signature is valid before the payload is trusted.
 */
async function checkEventValidity(
  message: SnsNotificationMessage,
): Promise<boolean> {
  if (env.NODE_ENV === "development") {
    return true;
  }

  const { TopicArn } = message;
  const configuredTopicArn = await SesSettingsService.getTopicArns();

  if (!configuredTopicArn.includes(TopicArn)) {
    logger.warn(
      { topicArn: TopicArn, messageId: message.MessageId },
      "Rejected SNS message from an unknown topic",
    );
    return false;
  }

  if (await verifySnsMessageSignature(message)) {
    return true;
  }

  const enforced = env.SNS_SIGNATURE_VERIFICATION !== "log-only";
  logger.error(
    {
      topicArn: TopicArn,
      messageId: message.MessageId,
      type: message.Type,
      signatureVersion: message.SignatureVersion,
      signingCertUrl: message.SigningCertURL,
      enforced,
    },
    enforced
      ? "Rejected SNS message with invalid signature"
      : "SNS message has an invalid signature, accepting because SNS_SIGNATURE_VERIFICATION=log-only",
  );

  return !enforced;
}
