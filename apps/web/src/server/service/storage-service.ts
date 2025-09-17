import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

let S3: S3Client | null = null;
export const DEFAULT_BUCKET = env.S3_COMPATIBLE_BUCKET || "unsend";

export const isStorageConfigured = () =>
  !!(
    env.S3_COMPATIBLE_ACCESS_KEY &&
    env.S3_COMPATIBLE_API_URL &&
    env.S3_COMPATIBLE_PUBLIC_URL &&
    env.S3_COMPATIBLE_SECRET_KEY
  );

const getClient = () => {
  if (
    !S3 &&
    env.S3_COMPATIBLE_ACCESS_KEY &&
    env.S3_COMPATIBLE_API_URL &&
    env.S3_COMPATIBLE_PUBLIC_URL &&
    env.S3_COMPATIBLE_SECRET_KEY
  ) {
    S3 = new S3Client({
      region: "auto",
      endpoint: env.S3_COMPATIBLE_API_URL,
      credentials: {
        accessKeyId: env.S3_COMPATIBLE_ACCESS_KEY,
        secretAccessKey: env.S3_COMPATIBLE_SECRET_KEY,
      },
      forcePathStyle: true, // needed for minio
    });
  }

  return S3;
};

export const getDocumentUploadUrl = async (
  key: string,
  fileType: string,
  bucket: string = DEFAULT_BUCKET
) => {
  const s3Client = getClient();

  if (!s3Client) {
    throw new Error("R2 is not configured");
  }

  const url = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType,
    }),
    {
      expiresIn: 3600,
      signableHeaders: new Set(["content-type"]),
    }
  );

  return url;
};
