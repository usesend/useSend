import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { inboundEmailQueue } from "~/server/jobs/inbound-email-worker";
import { DEFAULT_QUEUE_OPTIONS } from "~/server/queue/queue-constants";

interface SnsNotification {
  Type: string;
  TopicArn: string;
  Message?: string;
  SubscribeURL?: string;
}

interface SesMailObject {
  messageId?: string;
  source?: string;
  destination?: string[];
  commonHeaders?: {
    from?: string[];
    subject?: string;
  };
}

interface SesReceiptObject {
  recipients?: string[];
  action?: {
    type?: string;
    objectKey?: string;
    objectKeyPrefix?: string;
  };
}

interface SesInboundMessage {
  mail?: SesMailObject;
  receipt?: SesReceiptObject;
  content?: string;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const data: SnsNotification = await req.json();

  if (!checkEventValidity(data)) {
    logger.warn({ topicArn: data.TopicArn }, "Invalid inbound SNS event");
    return Response.json({ data: "Event is not valid" });
  }

  if (data.Type === "SubscriptionConfirmation") {
    return handleSubscription(data);
  }

  if (data.Type !== "Notification") {
    return Response.json({ data: "Ignored" });
  }

  try {
    const snsMessage = data.Message ?? "";
    const parsedMessage: SesInboundMessage = JSON.parse(snsMessage || "{}");

    const recipientAddress = extractRecipient(parsedMessage);
    if (!recipientAddress) {
      logger.warn("No recipient address found in inbound email");
      return Response.json({ data: "No recipient" });
    }

    const domainName = recipientAddress.split("@")[1]?.toLowerCase();
    if (!domainName) {
      logger.warn({ recipientAddress }, "Invalid recipient address format");
      return Response.json({ data: "Invalid recipient" });
    }

    const domain = await db.domain.findUnique({
      where: { name: domainName },
      include: { team: true },
    });

    if (!domain || !domain.inboundEnabled) {
      logger.info(
        { domainName, inboundEnabled: domain?.inboundEnabled },
        "Domain not found or inbound disabled, dropping email"
      );
      return Response.json({ data: "Dropped" });
    }

    const fromAddress = extractSender(parsedMessage);
    const subject = extractSubject(parsedMessage);
    const s3Key = extractS3Key(parsedMessage);

    const inboundEmail = await db.inboundEmail.create({
      data: {
        teamId: domain.teamId,
        domainId: domain.id,
        from: fromAddress ?? "unknown",
        to: recipientAddress,
        subject,
        s3Key,
        status: "RECEIVED",
      },
    });

    await inboundEmailQueue.add(
      inboundEmail.id,
      {
        inboundEmailId: inboundEmail.id,
        teamId: domain.teamId,
        domainId: domain.id,
        snsMessage,
        s3Key,
      },
      { jobId: inboundEmail.id, ...DEFAULT_QUEUE_OPTIONS }
    );

    logger.info(
      {
        inboundEmailId: inboundEmail.id,
        domainId: domain.id,
        from: fromAddress,
        to: recipientAddress,
      },
      "Enqueued inbound email for processing"
    );

    return Response.json({ data: "Success" });
  } catch (e) {
    logger.error({ err: e }, "Error processing inbound email callback");
    return Response.json(
      { data: "Error processing inbound email" },
      { status: 500 }
    );
  }
}

async function handleSubscription(message: SnsNotification) {
  const topicArn = message.TopicArn;

  if (env.INBOUND_SNS_TOPIC_ARN && topicArn !== env.INBOUND_SNS_TOPIC_ARN) {
    logger.warn(
      { topicArn, expected: env.INBOUND_SNS_TOPIC_ARN },
      "Subscription confirmation for unknown topic"
    );
    return Response.json({ data: "Unknown topic" });
  }

  try {
    await fetch(message.SubscribeURL!, { method: "GET" });
    logger.info({ topicArn }, "Confirmed inbound SNS subscription");
  } catch (err) {
    logger.error({ err }, "Failed to confirm SNS subscription");
    return Response.json(
      { data: "Failed to confirm subscription" },
      { status: 500 }
    );
  }

  return Response.json({ data: "Subscription confirmed" });
}

function checkEventValidity(message: SnsNotification): boolean {
  if (env.NODE_ENV === "development") {
    return true;
  }

  const { TopicArn } = message;

  if (!env.INBOUND_SNS_TOPIC_ARN) {
    return false;
  }

  return TopicArn === env.INBOUND_SNS_TOPIC_ARN;
}

function extractRecipient(parsedMessage: SesInboundMessage): string | undefined {
  if (parsedMessage.receipt?.recipients?.[0]) {
    return parsedMessage.receipt.recipients[0].toLowerCase();
  }
  if (parsedMessage.mail?.destination?.[0]) {
    return parsedMessage.mail.destination[0].toLowerCase();
  }
  return undefined;
}

function extractSender(parsedMessage: SesInboundMessage): string | undefined {
  return parsedMessage.mail?.source ?? parsedMessage.mail?.commonHeaders?.from?.[0];
}

function extractSubject(parsedMessage: SesInboundMessage): string | undefined {
  return parsedMessage.mail?.commonHeaders?.subject;
}

function extractS3Key(parsedMessage: SesInboundMessage): string | undefined {
  if (parsedMessage.receipt?.action?.type === "S3") {
    const prefix = parsedMessage.receipt.action.objectKeyPrefix ?? "";
    const key = parsedMessage.receipt.action.objectKey;
    return key ?? (prefix ? `${prefix}${parsedMessage.mail?.messageId}` : undefined);
  }
  return undefined;
}
