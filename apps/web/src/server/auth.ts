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
import { Prisma } from "@prisma/client";

import { sendSignUpEmail } from "~/server/mailer";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  canRegisterSelfHostedUser,
  normalizeAuthEmail,
} from "~/server/auth/registration-policy";

const GITHUB_OAUTH_ISSUER = "https://github.com/login/oauth";

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
    isInstanceAdmin: boolean;
  }
}

const prismaAdapter = PrismaAdapter(db) as Adapter;

const createUser: NonNullable<Adapter["createUser"]> = async (user) => {
  if (env.NEXT_PUBLIC_IS_CLOUD) {
    return prismaAdapter.createUser!(user);
  }

  if (!user.email) {
    throw new Error("Self-hosted registration requires an email address");
  }

  const email = normalizeAuthEmail(user.email);

  return db.$transaction(
    async (tx) => {
      const userCount = await tx.user.count();

      if (userCount > 0) {
        const invite = await tx.teamInvite.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });

        if (!invite) {
          throw new Error("Self-hosted registration is invite-only");
        }
      }

      const createdUser = await tx.user.create({
        data: {
          name: user.name,
          email,
          emailVerified: user.emailVerified,
          image: user.image,
          isInstanceAdmin: userCount === 0,
        },
      });

      return createdUser as unknown as AdapterUser;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

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
      })
    );
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      })
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
      })
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
    signIn: async ({ user }) => {
      if (env.NEXT_PUBLIC_IS_CLOUD) return true;
      if (!user.email) return false;

      return canRegisterSelfHostedUser(db, user.email);
    },
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
        isBetaUser: user.isBetaUser,
        isAdmin: env.NEXT_PUBLIC_IS_CLOUD
          ? user.email === env.ADMIN_EMAIL
          : user.isInstanceAdmin || user.email === env.ADMIN_EMAIL,
        isWaitlisted: user.isWaitlisted,
      },
    }),
  },
  adapter: {
    ...prismaAdapter,
    createUser,
  },
  pages: {
    signIn: "/login",
  },
  events: {
    createUser: async ({ user }) => {
      let invitesAvailable = false;

      if (user.email) {
        const invites = await db.teamInvite.findMany({
          where: {
            email: { equals: user.email, mode: "insensitive" },
            expiresAt: { gt: new Date() },
          },
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
