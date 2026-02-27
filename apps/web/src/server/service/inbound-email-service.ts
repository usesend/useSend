import { InboundEmailStatus } from "@prisma/client";
import { db } from "../db";
import { logger } from "../logger/log";
import { fetchRawEmail } from "../aws/s3-inbound";
import { env } from "~/env";
import { EmailQueueService } from "./email-queue-service";
import { simpleParser, ParsedMail } from "mailparser";

const MAX_FORWARDING_HOPS = 3;
const FORWARDING_HOP_HEADER = "x-unsend-forwarding-hops";

export interface InboundEmailJobData {
  inboundEmailId: string;
  teamId: number;
  domainId: number;
  snsMessage: string;
  s3Key?: string;
}

export async function processInboundEmail(
  data: InboundEmailJobData
): Promise<void> {
  const { inboundEmailId, teamId, domainId, snsMessage, s3Key } = data;

  const inboundEmail = await db.inboundEmail.findUnique({
    where: { id: inboundEmailId },
  });

  if (!inboundEmail) {
    logger.error({ inboundEmailId }, "InboundEmail record not found");
    return;
  }

  const domain = await db.domain.findUnique({
    where: { id: domainId },
  });

  if (!domain) {
    logger.error({ domainId }, "Domain not found for inbound email");
    await updateInboundEmailStatus(
      inboundEmailId,
      InboundEmailStatus.FAILED,
      "Domain not found"
    );
    return;
  }

  let parsed: ParsedMail;
  try {
    parsed = await parseEmail(snsMessage, s3Key, domain.region);
  } catch (error) {
    logger.error(
      { err: error, inboundEmailId },
      "Failed to parse inbound email"
    );
    await updateInboundEmailStatus(
      inboundEmailId,
      InboundEmailStatus.FAILED,
      "Failed to parse email"
    );
    return;
  }

  const hopCount = getHopCount(parsed);
  if (hopCount > MAX_FORWARDING_HOPS) {
    logger.warn(
      { inboundEmailId, hopCount },
      "Forwarding loop detected, dropping email"
    );
    await updateInboundEmailStatus(
      inboundEmailId,
      InboundEmailStatus.FAILED,
      "Forwarding loop detected"
    );
    return;
  }

  const recipientAddress = inboundEmail.to;
  const localPart = recipientAddress.split("@")[0]?.toLowerCase();

  if (!localPart) {
    await updateInboundEmailStatus(
      inboundEmailId,
      InboundEmailStatus.FAILED,
      "Invalid recipient address"
    );
    return;
  }

  const forwardingRule = await db.emailForwardingRule.findUnique({
    where: {
      domainId_sourceAddress: {
        domainId,
        sourceAddress: localPart,
      },
    },
  });

  if (!forwardingRule || !forwardingRule.enabled) {
    logger.info(
      { inboundEmailId, localPart, domainId },
      "No active forwarding rule found"
    );
    await db.inboundEmail.update({
      where: { id: inboundEmailId },
      data: {
        status: InboundEmailStatus.NO_RULE,
        forwardingRuleId: forwardingRule?.id,
      },
    });
    return;
  }

  await db.inboundEmail.update({
    where: { id: inboundEmailId },
    data: {
      status: InboundEmailStatus.FORWARDING,
      forwardingRuleId: forwardingRule.id,
    },
  });

  const originalFrom =
    parsed.from?.value?.[0]?.address ?? inboundEmail.from;
  const originalFromName =
    parsed.from?.value?.[0]?.name ?? originalFrom;

  const rewrittenFrom = `"${originalFromName} via Unsend" <${forwardingRule.sourceAddress}@${domain.name}>`;

  try {
    const email = await db.email.create({
      data: {
        from: rewrittenFrom,
        to: [forwardingRule.destinationAddress],
        replyTo: [originalFrom],
        subject: parsed.subject ?? inboundEmail.subject ?? "(no subject)",
        text: parsed.text || undefined,
        html: parsed.html || undefined,
        teamId,
        domainId,
        isForwarded: true,
        headers: JSON.stringify({
          "X-Original-From": originalFrom,
          [FORWARDING_HOP_HEADER]: String(hopCount + 1),
        }),
      },
    });

    await EmailQueueService.queueEmail(
      email.id,
      teamId,
      domain.region,
      true
    );

    // FORWARDED means "queued for delivery via the email send pipeline",
    // not "confirmed delivered". Final delivery status is tracked on the Email record.
    await updateInboundEmailStatus(
      inboundEmailId,
      InboundEmailStatus.FORWARDED
    );

    logger.info(
      {
        inboundEmailId,
        emailId: email.id,
        from: rewrittenFrom,
        to: forwardingRule.destinationAddress,
      },
      "Forwarded inbound email"
    );
  } catch (error) {
    logger.error(
      { err: error, inboundEmailId },
      "Failed to forward inbound email"
    );
    await updateInboundEmailStatus(
      inboundEmailId,
      InboundEmailStatus.FAILED,
      error instanceof Error ? error.message : "Failed to forward email"
    );
  }
}

async function parseEmail(
  snsMessage: string,
  s3Key: string | undefined,
  region: string
): Promise<ParsedMail> {
  let rawContent: string;

  const snsData = JSON.parse(snsMessage);

  if (snsData.content) {
    rawContent = snsData.content;
  } else if (s3Key && env.INBOUND_S3_BUCKET) {
    rawContent = await fetchRawEmail(s3Key, env.INBOUND_S3_BUCKET, region);
  } else {
    throw new Error(
      "No email content available: SNS payload truncated and no S3 key"
    );
  }

  return simpleParser(rawContent);
}

function getHopCount(parsed: ParsedMail): number {
  const headers = parsed.headers;
  const hopHeader = headers.get(FORWARDING_HOP_HEADER);

  if (!hopHeader) {
    return 0;
  }

  const hopValue =
    typeof hopHeader === "string"
      ? hopHeader
      : (hopHeader as { value?: string }).value;

  const count = parseInt(hopValue ?? "0", 10);
  return isNaN(count) ? 0 : count;
}

async function updateInboundEmailStatus(
  id: string,
  status: InboundEmailStatus,
  errorMessage?: string
): Promise<void> {
  await db.inboundEmail.update({
    where: { id },
    data: { status, errorMessage },
  });
}
