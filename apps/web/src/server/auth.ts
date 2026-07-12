import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { type Adapter, type AdapterUser } from "next-auth/adapters";
import GitHubProvider from "next-auth/providers/github";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";
import { Provider } from "next-auth/providers/index";

import { sendSignUpEmail } from "~/server/mailer";
import { env } from "~/env";
import { db } from "~/server/db";

const GITHUB_OAUTH_ISSUER = "https://github.com/login/oauth";

/**
 * PostgreSQL advisory-lock namespace for self-hosted user creation.
 *
 * The lock serializes only transactions that request this same key; it does not
 * lock the User table or any rows. Because pg_advisory_xact_lock is scoped to
 * the current transaction, PostgreSQL releases it automatically on commit,
 * rollback, or connection loss. A concurrent registration may wait briefly for
 * the active registration transaction to finish.
 */
const SELF_HOSTED_REGISTRATION_LOCK_ID = 1431520590;

export class SelfHostedRegistrationError extends Error {
  constructor() {
    super("A team invitation is required to create an account");
    this.name = "SelfHostedRegistrationError";
  }
}

export async function canRegisterSelfHostedUser(email?: string | null) {
  if (env.NEXT_PUBLIC_IS_CLOUD) {
    return true;
  }

  if (!email) {
    return false;
  }

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return true;
  }

  const firstUser = await db.user.findFirst({
    select: { id: true },
  });

  if (!firstUser) {
    return true;
  }

  const invite = await db.teamInvite.findFirst({
    where: { email },
    select: { id: true },
  });

  return Boolean(invite);
}

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  // eslint-disable-next-line no-unused-vars
  interface Session extends DefaultSession {
    user: {
      id: number;
      isBetaUser: boolean;
      isAdmin: boolean;
      isWaitlisted: boolean;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // eslint-disable-next-line no-unused-vars
  interface User {
    id: number;
    isBetaUser: boolean;
    isAdmin: boolean;
    isWaitlisted: boolean;
  }
}

/**
 * Auth providers
 */

function getProviders() {
  const providers: Provider[] = [];

  if (env.GITHUB_ID && env.GITHUB_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: env.GITHUB_ID,
        clientSecret: env.GITHUB_SECRET,
        // GitHub now includes `iss` on OAuth callbacks, so NextAuth needs the expected issuer.
        issuer: GITHUB_OAUTH_ISSUER,
        allowDangerousEmailAccountLinking: true,
        authorization: {
          params: {
            scope: "read:user user:email",
          },
        },
      }),
    );
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (env.FROM_EMAIL) {
    providers.push(
      EmailProvider({
        from: env.FROM_EMAIL,
        async sendVerificationRequest({ identifier: email, url, token }) {
          await sendSignUpEmail(email, token, url);
        },
        async generateVerificationToken() {
          return Math.random().toString(36).substring(2, 7).toLowerCase();
        },
      }),
    );
  }

  if (providers.length === 0 && process.env.SKIP_ENV_VALIDATION !== "true") {
    throw new Error("No auth providers found, need atleast one");
  }

  return providers;
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    signIn: async ({ user }) => canRegisterSelfHostedUser(user.email),
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
        isBetaUser: user.isBetaUser,
        isAdmin: user.email === env.ADMIN_EMAIL,
        isWaitlisted: user.isWaitlisted,
      },
    }),
  },
  adapter: (() => {
    const prismaAdapter = PrismaAdapter(db);

    return {
      ...prismaAdapter,
      async createUser(user: AdapterUser) {
        if (env.NEXT_PUBLIC_IS_CLOUD) {
          if (!prismaAdapter.createUser) {
            throw new Error("Prisma adapter does not support user creation");
          }

          return prismaAdapter.createUser(user);
        }

        if (!user.email) {
          throw new SelfHostedRegistrationError();
        }

        return db.$transaction(async (tx) => {
          // Acquire the lock before checking for the first user. Without this,
          // two concurrent callbacks could both observe an empty User table and
          // both create an account without an invitation.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SELF_HOSTED_REGISTRATION_LOCK_ID})`;

          const firstUser = await tx.user.findFirst({
            select: { id: true },
          });

          if (firstUser) {
            const invite = await tx.teamInvite.findFirst({
              where: { email: user.email },
              select: { id: true },
            });

            if (!invite) {
              throw new SelfHostedRegistrationError();
            }
          }

          return tx.user.create({
            data: {
              name: user.name,
              email: user.email,
              emailVerified: user.emailVerified,
              image: user.image,
            },
          });
        });
      },
    } as Adapter;
  })(),
  pages: {
    signIn: "/login",
  },
  events: {
    createUser: async ({ user }) => {
      let invitesAvailable = false;

      if (user.email) {
        const invites = await db.teamInvite.findMany({
          where: { email: user.email },
        });

        invitesAvailable = invites.length > 0;
      }

      if (
        !env.NEXT_PUBLIC_IS_CLOUD ||
        env.NODE_ENV === "development" ||
        invitesAvailable
      ) {
        await db.user.update({
          where: { id: user.id },
          data: { isBetaUser: true },
        });
      } else {
        await db.user.update({
          where: { id: user.id },
          data: { isBetaUser: true, isWaitlisted: true },
        });
      }
    },
  },
  providers: getProviders(),
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
