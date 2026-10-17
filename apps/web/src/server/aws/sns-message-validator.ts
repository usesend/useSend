import { createVerify } from "crypto";
import https from "https";
import { SnsNotificationMessage } from "~/types/aws-types";

/**
 * Extracts the region from an SNS TopicArn.
 * TopicArn format: arn:aws:sns:REGION:ACCOUNT-ID:TOPIC-NAME
 */
function extractRegionFromTopicArn(topicArn: string): string | null {
  const parts = topicArn.split(":");
  if (parts.length >= 4 && parts[0] === "arn" && parts[2] === "sns") {
    return parts[3];
  }
  return null;
}

/**
 * Validates that the signing certificate URL is from an AWS SNS host in the correct region.
 * Prevents SSRF attacks by:
 * 1. Deriving the expected region from TopicArn
 * 2. Validating the certificate URL hostname matches that region
 * 3. Enforcing HTTPS protocol
 * 4. Verifying the path contains expected SNS certificate path pattern
 */
function isValidSnsSigningCertificateUrl(
  url: string,
  topicArn: string
): boolean {
  try {
    const urlObj = new URL(url);

    // Extract region from TopicArn
    const region = extractRegionFromTopicArn(topicArn);
    if (!region) {
      return false;
    }

    // Build expected hostname patterns for this region
    const expectedHostnames = [
      `sns.${region}.amazonaws.com`,
      // Some regions might use the regional endpoint
      `sns.amazonaws.com`
    ];

    // Check if the certificate URL hostname matches expected patterns
    const isExpectedHost = expectedHostnames.some(
      (host) => urlObj.hostname === host
    );

    // Ensure it's HTTPS and has the expected SNS certificate path format
    return (
      urlObj.protocol === "https:" &&
      (urlObj.pathname.includes("/sns/") || urlObj.pathname.endsWith(".pem")) &&
      isExpectedHost
    );
  } catch {
    return false;
  }
}

/**
 * Builds the canonical string to sign for SNS message signature verification.
 * AWS SNS signs a string where every field is terminated by a newline, including the last one.
 * Field order depends on message type:
 * - Notification: Message, MessageId, Subject, Timestamp, TopicArn, Type
 * - SubscriptionConfirmation: Message, MessageId, SubscribeURL, Timestamp, Token, TopicArn, Type
 * Format: field1\nvalue1\nfield2\nvalue2\n...\n
 */
export function buildSnsStringToSign(message: SnsNotificationMessage): string {
  let fields: string[];
  const values: Record<string, string | undefined> = {};

  if (message.Type === "SubscriptionConfirmation") {
    // SubscriptionConfirmation message field order
    fields = [
      "Message",
      "MessageId",
      "SubscribeURL",
      "Timestamp",
      "Token",
      "TopicArn",
      "Type"
    ];
    values.Message = message.Message;
    values.MessageId = message.MessageId;
    values.SubscribeURL = message.SubscribeURL;
    values.Timestamp = message.Timestamp;
    values.Token = message.Token;
    values.TopicArn = message.TopicArn;
    values.Type = message.Type;
  } else {
    // Notification message field order (default)
    fields = [
      "Message",
      "MessageId",
      "Subject",
      "Timestamp",
      "TopicArn",
      "Type"
    ];
    values.Message = message.Message;
    values.MessageId = message.MessageId;
    values.Subject = message.Subject;
    values.Timestamp = message.Timestamp;
    values.TopicArn = message.TopicArn;
    values.Type = message.Type;
  }

  return fields
    .filter((field) => values[field] !== undefined)
    .map((field) => `${field}\n${values[field] as string}\n`)
    .join("");
}

/**
 * Fetches the certificate from the SigningCertURL after validation.
 * Validates that the URL is from an AWS SNS host in the same region as TopicArn before fetching.
 */
export async function getCertificate(
  signingCertUrl: string,
  topicArn: string
): Promise<string> {
  // Validate the URL before making any network request
  if (!isValidSnsSigningCertificateUrl(signingCertUrl, topicArn)) {
    const region = extractRegionFromTopicArn(topicArn);
    throw new Error(
      `Invalid SNS signing certificate URL: must be from aws SNS host in region ${region}`
    );
  }

  return new Promise((resolve, reject) => {
    https
      .get(signingCertUrl, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

/**
 * Determines the hash algorithm based on SignatureVersion.
 * Version 1 uses RSA-SHA1, Version 2 uses RSA-SHA256.
 */
function getSignatureAlgorithm(signatureVersion: string): string {
  switch (signatureVersion) {
    case "1":
      return "RSA-SHA1";
    case "2":
      return "RSA-SHA256";
    default:
      throw new Error(
        `Unsupported SNS SignatureVersion: ${signatureVersion}. Supported versions are 1 (RSA-SHA1) and 2 (RSA-SHA256)`
      );
  }
}

/**
 * Verifies the SNS message signature using the appropriate algorithm based on SignatureVersion.
 */
export async function verifySnsMessageSignature(
  message: SnsNotificationMessage
): Promise<boolean> {
  try {
    // Validate signature version before proceeding
    const algorithm = getSignatureAlgorithm(message.SignatureVersion);

    const stringToSign = buildSnsStringToSign(message);
    const certificate = await getCertificate(
      message.SigningCertURL,
      message.TopicArn
    );

    const verifier = createVerify(algorithm);
    verifier.update(stringToSign);

    return verifier.verify(certificate, message.Signature, "base64");
  } catch (error) {
    console.error("Error verifying SNS message signature:", error);
    return false;
  }
}
