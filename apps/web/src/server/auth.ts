import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession, emailOTP } from "better-auth/plugins";
import { headers } from "next/headers";

import { env } from "~/env";
import { db } from "~/server/db";
import { sendSignInOtpEmail } from "~/server/mailer";
import { getRedis, redisKey } from "~/server/redis";

const authBaseUrl = env.BETTER_AUTH_URL ?? env.NEXTAUTH_URL;

export type AuthProvider = {
  id: "email-otp" | "github" | "google";
  name: string;
  type: "email" | "oauth";
};

export const authProviders: AuthProvider[] = [
  ...(env.GITHUB_ID && env.GITHUB_SECRET
    ? [{ id: "github", name: "GitHub", type: "oauth" } as const]
    : []),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [{ id: "google", name: "Google", type: "oauth" } as const]
    : []),
  ...(env.FROM_EMAIL
    ? [{ id: "email-otp", name: "Email", type: "email" } as const]
    : []),
];

if (authProviders.length === 0 && process.env.SKIP_ENV_VALIDATION !== "true") {
  throw new Error("No auth providers found, need at least one");
}

const redisRateLimitStorage = {
  async get(key: string) {
    const value = await getRedis().get(redisKey(`better-auth:rate:${key}`));
    return value
      ? (JSON.parse(value) as {
          key: string;
          count: number;
          lastRequest: number;
        })
      : null;
  },
  async set(
    key: string,
    value: { key: string; count: number; lastRequest: number },
  ) {
    await getRedis().setex(
      redisKey(`better-auth:rate:${key}`),
      60,
      JSON.stringify(value),
    );
  },
  async consume(key: string, rule: { window: number; max: number }) {
    const result = (await getRedis().eval(
      `local count = redis.call("INCR", KEYS[1])
       if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
       return {count, redis.call("TTL", KEYS[1])}`,
      1,
      redisKey(`better-auth:rate:${key}`),
      rule.window,
    )) as [number, number];

    return {
      allowed: result[0] <= rule.max,
      retryAfter: result[0] <= rule.max ? null : Math.max(result[1], 1),
    };
  },
};

const basePlugins = [
  ...(env.FROM_EMAIL
    ? [
        emailOTP({
          otpLength: 6,
          expiresIn: 5 * 60,
          allowedAttempts: 3,
          storeOTP: "hashed",
          rateLimit: {
            window: 60,
            max: env.AUTH_EMAIL_RATE_LIMIT > 0 ? env.AUTH_EMAIL_RATE_LIMIT : 3,
          },
          async sendVerificationOTP({ email, otp, type }) {
            if (type === "sign-in") {
              await sendSignInOtpEmail(email, otp, authBaseUrl);
            }
          },
        }),
      ]
    : []),
];

export const authConfig = {
  appName: "useSend",
  baseURL: authBaseUrl,
  secret: env.BETTER_AUTH_SECRET ?? env.NEXTAUTH_SECRET,
  trustedOrigins: [authBaseUrl],
  database: prismaAdapter(db, { provider: "postgresql" }),
  socialProviders: {
    ...(env.GITHUB_ID && env.GITHUB_SECRET
      ? {
          github: {
            clientId: env.GITHUB_ID,
            clientSecret: env.GITHUB_SECRET,
            scope: ["read:user", "user:email"],
          },
        }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  user: {
    fields: {
      emailVerified: "betterAuthEmailVerified",
    },
    additionalFields: {
      isBetaUser: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
      isWaitlisted: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    fields: {
      token: "sessionToken",
      expiresAt: "expires",
    },
  },
  account: {
    fields: {
      accountId: "providerAccountId",
      providerId: "provider",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "accessTokenExpiresAt",
      refreshTokenExpiresAt: "refreshTokenExpiresAt",
    },
    encryptOAuthTokens: true,
  },
  verification: {
    modelName: "verificationToken",
    fields: {
      value: "token",
      expiresAt: "expires",
    },
  },
  advanced: {
    disableCSRFCheck: false,
    disableOriginCheck: false,
    database: {
      generateId: (options) =>
        options.model === "user" ? false : crypto.randomUUID(),
    },
  },
  rateLimit: {
    enabled: true,
    customStorage: redisRateLimitStorage,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const invites = await db.teamInvite.findMany({
            where: { email: user.email },
          });
          const receivesImmediateAccess =
            !env.NEXT_PUBLIC_IS_CLOUD ||
            env.NODE_ENV === "development" ||
            invites.length > 0;

          await db.user.update({
            where: { id: Number(user.id) },
            data: receivesImmediateAccess
              ? { isBetaUser: true }
              : { isBetaUser: true, isWaitlisted: true },
          });
        },
      },
    },
  },
  plugins: basePlugins,
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...authConfig,
  plugins: [
    ...basePlugins,
    customSession(
      async ({ user, session }) => ({
        session,
        user: {
          ...user,
          id: Number(user.id),
          isAdmin: user.email === env.ADMIN_EMAIL,
        },
      }),
      authConfig,
    ),
  ],
});

export type AppSession = typeof auth.$Infer.Session;

export const getServerAuthSession = async (requestHeaders?: Headers) =>
  auth.api.getSession({ headers: requestHeaders ?? (await headers()) });
