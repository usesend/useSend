import { createVerify } from "crypto";
import https from "https";
import { SnsNotificationMessage } from "~/types/aws-types";

// AWS SNS certificate URLs must come from approved hosts
const APPROVED_SNS_CERTIFICATE_HOSTS = [
  "sns.amazonaws.com",
  "sns.us-east-1.amazonaws.com",
  "sns.us-east-2.amazonaws.com",
  "sns.us-west-1.amazonaws.com",
  "sns.us-west-2.amazonaws.com",
  "sns.eu-west-1.amazonaws.com",
  "sns.eu-west-2.amazonaws.com",
  "sns.eu-west-3.amazonaws.com",
  "sns.eu-central-1.amazonaws.com",
  "sns.eu-north-1.amazonaws.com",
  "sns.ap-east-1.amazonaws.com",
  "sns.ap-northeast-1.amazonaws.com",
  "sns.ap-northeast-2.amazonaws.com",
  "sns.ap-southeast-1.amazonaws.com",
  "sns.ap-southeast-2.amazonaws.com",
  "sns.ap-south-1.amazonaws.com",
  "sns.ca-central-1.amazonaws.com",
  "sns.sa-east-1.amazonaws.com"
];

/**
 * Validates that the signing certificate URL is from an approved AWS SNS host.
 * Prevents SSRF attacks by restricting certificate fetch to known AWS endpoints.
 */
function isValidSnsSigningCertificateUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const isApproved = APPROVED_SNS_CERTIFICATE_HOSTS.some(
      (host) =>
        urlObj.hostname === host || urlObj.hostname?.endsWith("." + host)
    );
    // Ensure it's HTTPS and has the expected path format
    return (
      urlObj.protocol === "https:" &&
      (urlObj.pathname.includes("/sns/") || urlObj.pathname.endsWith(".pem")) &&
      isApproved
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
 * Validates that the URL is from an approved AWS SNS host before fetching.
 */
export async function getCertificate(signingCertUrl: string): Promise<string> {
  // Validate the URL before making any network request
  if (!isValidSnsSigningCertificateUrl(signingCertUrl)) {
    throw new Error(
      "Invalid SNS signing certificate URL: must be from an approved AWS SNS host"
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
    const certificate = await getCertificate(message.SigningCertURL);

    const verifier = createVerify(algorithm);
    verifier.update(stringToSign);

    return verifier.verify(certificate, message.Signature, "base64");
  } catch (error) {
    console.error("Error verifying SNS message signature:", error);
    return false;
  }
}
