import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { type Adapter } from "next-auth/adapters";
import GitHubProvider from "next-auth/providers/github";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { Provider } from "next-auth/providers/index";

import { sendSignUpEmail } from "~/server/mailer";
import { env } from "~/env";
import { db } from "~/server/db";
import { verifySecureHash } from "~/server/crypto";

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

  // Credentials provider for email/password authentication
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const user = await db.user.findUnique({ where: { email } });

        // Always run hash verification to prevent timing attacks
        // Use a dummy hash when user doesn't exist to normalize response time
        const DUMMY_HASH = "0000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
        const isValid = await verifySecureHash(password, hashToVerify);

        if (!user || !user.passwordHash || !isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isBetaUser: user.isBetaUser,
          isAdmin: user.email === env.ADMIN_EMAIL,
          isWaitlisted: user.isWaitlisted,
        };
      },
    })
  );

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
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.isBetaUser = user.isBetaUser;
        token.isWaitlisted = user.isWaitlisted;
        token.isAdmin = user.email === env.ADMIN_EMAIL;
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as number,
        isBetaUser: token.isBetaUser as boolean,
        isAdmin: token.isAdmin as boolean,
        isWaitlisted: token.isWaitlisted as boolean,
      },
    }),
  },
  adapter: PrismaAdapter(db) as Adapter,
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
