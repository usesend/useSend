import { createVerify } from "crypto";
import https from "https";
import { SnsNotificationMessage } from "~/types/aws-types";

/**
 * Builds the canonical string to sign for SNS message signature verification.
 * AWS SNS signs a string where every field is terminated by a newline, including the last one.
 * Format: field1\nvalue1\nfield2\nvalue2\n...\n
 */
export function buildSnsStringToSign(message: SnsNotificationMessage): string {
  const fields = [
    "Message",
    "MessageId",
    "Subject",
    "Timestamp",
    "TopicArn",
    "Type"
  ];

  const values: Record<string, string | undefined> = {
    Message: message.Message,
    MessageId: message.MessageId,
    Subject: message.Subject,
    Timestamp: message.Timestamp,
    TopicArn: message.TopicArn,
    Type: message.Type
  };

  return fields
    .filter((field) => values[field] !== undefined)
    .map((field) => `${field}\n${values[field] as string}\n`)
    .join("");
}

/**
 * Fetches the certificate from the SigningCertURL
 */
export async function getCertificate(signingCertUrl: string): Promise<string> {
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
 * Verifies the SNS message signature
 */
export async function verifySnsMessageSignature(
  message: SnsNotificationMessage
): Promise<boolean> {
  try {
    const stringToSign = buildSnsStringToSign(message);
    const certificate = await getCertificate(message.SigningCertURL);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(stringToSign);

    return verifier.verify(certificate, message.Signature, "base64");
  } catch (error) {
    console.error("Error verifying SNS message signature:", error);
    return false;
  }
}
