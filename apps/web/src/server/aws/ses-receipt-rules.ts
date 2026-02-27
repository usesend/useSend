import {
  SESClient,
  CreateReceiptRuleCommand,
  DeleteReceiptRuleCommand,
} from "@aws-sdk/client-ses";
import { env } from "~/env";
import { logger } from "../logger/log";

const RECEIVING_REGIONS = ["us-east-1", "us-west-2", "eu-west-1"] as const;

export type ReceivingRegion = (typeof RECEIVING_REGIONS)[number];

export function isReceivingRegion(region: string): region is ReceivingRegion {
  return RECEIVING_REGIONS.includes(region as ReceivingRegion);
}

function getSesV1Client(region: string) {
  return new SESClient({
    region,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY,
      secretAccessKey: env.AWS_SECRET_KEY,
    },
  });
}

function getReceiptRuleName(domainName: string) {
  return `unsend-inbound-${domainName}`;
}

export async function createReceiptRule(
  domainName: string,
  region: string,
  ruleSetName: string,
  snsTopicArn: string,
  s3Bucket: string
): Promise<string> {
  const client = getSesV1Client(region);
  const ruleName = getReceiptRuleName(domainName);

  const command = new CreateReceiptRuleCommand({
    RuleSetName: ruleSetName,
    Rule: {
      Name: ruleName,
      Enabled: true,
      Recipients: [domainName],
      ScanEnabled: true,
      Actions: [
        {
          S3Action: {
            BucketName: s3Bucket,
            ObjectKeyPrefix: `inbound/${domainName}/`,
          },
        },
        {
          SNSAction: {
            TopicArn: snsTopicArn,
            Encoding: "UTF-8",
          },
        },
      ],
    },
  });

  const response = await client.send(command);

  if (response.$metadata.httpStatusCode !== 200) {
    logger.error(
      { response, domainName },
      "Failed to create SES Receipt Rule"
    );
    throw new Error("Failed to create SES Receipt Rule");
  }

  logger.info({ domainName, ruleName }, "Created SES Receipt Rule");
  return ruleName;
}

export async function deleteReceiptRule(
  domainName: string,
  region: string,
  ruleSetName: string
): Promise<void> {
  const client = getSesV1Client(region);
  const ruleName = getReceiptRuleName(domainName);

  const command = new DeleteReceiptRuleCommand({
    RuleSetName: ruleSetName,
    RuleName: ruleName,
  });

  const response = await client.send(command);

  if (response.$metadata.httpStatusCode !== 200) {
    logger.error(
      { response, domainName },
      "Failed to delete SES Receipt Rule"
    );
    throw new Error("Failed to delete SES Receipt Rule");
  }

  logger.info({ domainName, ruleName }, "Deleted SES Receipt Rule");
}
