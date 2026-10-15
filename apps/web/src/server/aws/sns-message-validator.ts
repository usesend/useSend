import { createVerify } from "node:crypto";
import { logger } from "~/server/logger/log";
import type { SnsNotificationMessage } from "~/types/aws-types";

const SNS_HOST_PATTERN = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;
const SIGNING_CERT_PATH_PATTERN = /\.pem$/i;

const certificateCache = new Map<string, Promise<string>>();

/**
 * Extracts the region from an SNS topic ARN (arn:aws:sns:<region>:<account>:<topic>).
 */
export function getSnsTopicRegion(topicArn: string): string | null {
  const match = /^arn:[^:]*:sns:([^:]+):/.exec(topicArn);
  return match?.[1] ?? null;
}

/**
 * Returns true only for an https URL on an AWS SNS regional host. When the
 * topic ARN is known, the host must match the topic's own region so a message
 * cannot point the server at another region or at a non-AWS host.
 */
export function isTrustedSnsUrl(rawUrl: string, topicArn?: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  if (!SNS_HOST_PATTERN.test(url.hostname)) {
    return false;
  }

  const region = topicArn ? getSnsTopicRegion(topicArn) : null;
  if (region) {
    const allowedHosts = [
      `sns.${region}.amazonaws.com`,
      `sns.${region}.amazonaws.com.cn`,
    ];
    if (!allowedHosts.includes(url.hostname)) {
      return false;
    }
  }

  return true;
}

function isTrustedSigningCertUrl(rawUrl: string, topicArn?: string): boolean {
  if (!isTrustedSnsUrl(rawUrl, topicArn)) {
    return false;
  }

  try {
    return SIGNING_CERT_PATH_PATTERN.test(new URL(rawUrl).pathname);
  } catch {
    return false;
  }
}

async function getSigningCertificate(certUrl: string): Promise<string> {
  const cached = certificateCache.get(certUrl);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const response = await fetch(certUrl, {
      method: "GET",
      // Do not follow redirects: the certificate URL must be the AWS SNS host.
      redirect: "error",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch SNS signing certificate, status: ${response.status}`,
      );
    }

    return await response.text();
  })();

  certificateCache.set(certUrl, pending);

  try {
    return await pending;
  } catch (error) {
    certificateCache.delete(certUrl);
    throw error;
  }
}

/**
 * Builds the canonical string that AWS SNS signs. The fields are concatenated
 * as "<field>\n<value>\n" in AWS's order, which is alphabetical by field name.
 */
function buildSignableString(message: SnsNotificationMessage): string {
  const isSubscription =
    message.Type === "SubscriptionConfirmation" ||
    message.Type === "UnsubscribeConfirmation";

  const fieldOrder = isSubscription
    ? [
        "Message",
        "MessageId",
        "SubscribeURL",
        "Timestamp",
        "Token",
        "TopicArn",
        "Type",
      ]
    : ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];

  let signable = "";
  for (const field of fieldOrder) {
    const value = (message as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      continue;
    }
    signable += `${field}\n${value}\n`;
  }

  return signable;
}

function getSignatureAlgorithm(signatureVersion: string): string | null {
  if (signatureVersion === "1") {
    return "RSA-SHA1";
  }
  if (signatureVersion === "2") {
    return "RSA-SHA256";
  }
  return null;
}

/**
 * Verifies the AWS SNS message signature. Returns true only when the message
 * carries a valid signature produced by the certificate served from the AWS
 * SNS host for the message's own topic region.
 */
export async function verifySnsMessageSignature(
  message: SnsNotificationMessage,
): Promise<boolean> {
  try {
    const { Signature, SignatureVersion, SigningCertURL, TopicArn } = message;

    if (!Signature || !SignatureVersion || !SigningCertURL || !TopicArn) {
      logger.warn("SNS message is missing signature fields");
      return false;
    }

    const algorithm = getSignatureAlgorithm(SignatureVersion);
    if (!algorithm) {
      logger.warn({ SignatureVersion }, "Unsupported SNS signature version");
      return false;
    }

    if (!isTrustedSigningCertUrl(SigningCertURL, TopicArn)) {
      logger.warn({ SigningCertURL }, "Untrusted SNS signing certificate URL");
      return false;
    }

    const certificate = await getSigningCertificate(SigningCertURL);

    const verifier = createVerify(algorithm);
    verifier.update(buildSignableString(message), "utf8");

    return verifier.verify(certificate, Signature, "base64");
  } catch (error) {
    logger.error({ err: error }, "Failed to verify SNS message signature");
    return false;
  }
}
