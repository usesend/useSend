import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "~/env";
import { logger } from "../logger/log";

function getS3Client(region: string) {
  return new S3Client({
    region,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY,
      secretAccessKey: env.AWS_SECRET_KEY,
    },
  });
}

export async function fetchRawEmail(
  s3Key: string,
  bucket: string,
  region: string
): Promise<string> {
  const client = getS3Client(region);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });

  const response = await client.send(command);

  if (!response.Body) {
    logger.error({ s3Key, bucket }, "Empty response from S3 for inbound email");
    throw new Error("Empty response from S3 for inbound email");
  }

  const rawEmail = await response.Body.transformToString("utf-8");

  logger.info(
    { s3Key, bucket, size: rawEmail.length },
    "Fetched raw inbound email from S3"
  );

  return rawEmail;
}
