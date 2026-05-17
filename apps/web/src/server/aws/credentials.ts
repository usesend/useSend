import { env } from "~/env";

export function getAwsCredentialOptions() {
  const hasKey = !!env.AWS_ACCESS_KEY_ID;
  const hasSecret = !!env.AWS_SECRET_ACCESS_KEY;

  if (hasKey !== hasSecret) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set or both be omitted"
    );
  }

  if (hasKey) {
    return {
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
    };
  }
  return {};
}
