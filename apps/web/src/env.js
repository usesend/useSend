import { EmailStatus } from "@prisma/client";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (str) => !str.includes("YOUR_MYSQL_URL_HERE"),
        "You forgot to change the default URL",
      ),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string() : z.string().url(),
    ),
    GITHUB_ID: z.string().optional(),
    GITHUB_SECRET: z.string().optional(),
    AWS_ACCESS_KEY: z.string(),
    AWS_SECRET_KEY: z.string(),
    USESEND_API_KEY: z.string().optional(),
    UNSEND_API_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    AWS_SES_ENDPOINT: z.string().optional(),
    AWS_SNS_ENDPOINT: z.string().optional(),
    AWS_DEFAULT_REGION: z.string().default("us-east-1"),
    API_RATE_LIMIT: z
      .string()
      .default("1")
      .transform((str) => parseInt(str, 10)),
    FROM_EMAIL: z.string().optional(),
    ADMIN_EMAIL: z.string().optional(),
    DISCORD_WEBHOOK_URL: z.string().optional(),
    REDIS_URL: z.string(),
    S3_COMPATIBLE_ACCESS_KEY: z.string().optional(),
    S3_COMPATIBLE_SECRET_KEY: z.string().optional(),
    S3_COMPATIBLE_API_URL: z.string().optional(),
    S3_COMPATIBLE_PUBLIC_URL: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_BASIC_PRICE_ID: z.string().optional(),
    STRIPE_BASIC_USAGE_PRICE_ID: z.string().optional(),
    STRIPE_LEGACY_BASIC_PRICE_ID: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    SMTP_HOST: z.string().default("smtp.usesend.com"),
    SMTP_USER: z.string().default("usesend"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
    NEXT_PUBLIC_IS_CLOUD: z
      .string()
      .default("false")
      .transform((str) => str === "true"),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GITHUB_ID: process.env.GITHUB_ID,
    GITHUB_SECRET: process.env.GITHUB_SECRET,
    AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
    AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
    USESEND_API_KEY: process.env.USESEND_API_KEY,
    UNSEND_API_KEY: process.env.UNSEND_API_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
    AWS_SES_ENDPOINT: process.env.AWS_SES_ENDPOINT,
    AWS_SNS_ENDPOINT: process.env.AWS_SNS_ENDPOINT,
    API_RATE_LIMIT: process.env.API_RATE_LIMIT,
    NEXT_PUBLIC_IS_CLOUD: process.env.NEXT_PUBLIC_IS_CLOUD,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    REDIS_URL: process.env.REDIS_URL,
    FROM_EMAIL: process.env.FROM_EMAIL,
    S3_COMPATIBLE_ACCESS_KEY: process.env.S3_COMPATIBLE_ACCESS_KEY,
    S3_COMPATIBLE_SECRET_KEY: process.env.S3_COMPATIBLE_SECRET_KEY,
    S3_COMPATIBLE_API_URL: process.env.S3_COMPATIBLE_API_URL,
    S3_COMPATIBLE_PUBLIC_URL: process.env.S3_COMPATIBLE_PUBLIC_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_BASIC_PRICE_ID: process.env.STRIPE_BASIC_PRICE_ID,
    STRIPE_BASIC_USAGE_PRICE_ID: process.env.STRIPE_BASIC_USAGE_PRICE_ID,
    STRIPE_LEGACY_BASIC_PRICE_ID: process.env.STRIPE_LEGACY_BASIC_PRICE_ID,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
