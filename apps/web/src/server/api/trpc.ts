/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { env } from "~/env";

import { getServerAuthSession } from "~/server/auth";
import { db } from "~/server/db";
import { getChildLogger, logger, withLogger } from "../logger/log";
import { randomUUID } from "crypto";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await getServerAuthSession();

  return {
    db,
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user || ctx.session.user.isWaitlisted) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const teamProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const teamUser = await db.teamUser.findFirst({
    where: { userId: ctx.session.user.id },
    include: { team: true },
  });

  if (!teamUser) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
  }

  return withLogger(
    getChildLogger({
      teamId: teamUser.team.id,
      requestId: randomUUID(),
    }),
    async () => {
      return next({
        ctx: {
          team: teamUser.team,
          teamUser,
          session: { ...ctx.session, user: ctx.session.user },
        },
      });
    }
  );
});

export const teamAdminProcedure = teamProcedure.use(async ({ ctx, next }) => {
  if (ctx.teamUser.role !== "ADMIN") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You are not authorized to perform this action",
    });
  }

  return next();
});

export const domainProcedure = teamProcedure
  .input(z.object({ id: z.number() }))
  .use(async ({ ctx, next, input }) => {
    const domain = await db.domain.findUnique({
      where: { id: input.id, teamId: ctx.team.id },
    });
    if (!domain) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Domain not found" });
    }

    return next({ ctx: { ...ctx, domain } });
  });

export const emailProcedure = teamProcedure
  .input(z.object({ id: z.string() }))
  .use(async ({ ctx, next, input }) => {
    const email = await db.email.findUnique({
      where: { id: input.id, teamId: ctx.team.id },
    });
    if (!email) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
    }

    return next({ ctx: { ...ctx, email } });
  });

export const apiKeyProcedure = teamProcedure
  .input(z.object({ id: z.number() }))
  .use(async ({ ctx, next, input }) => {
    const apiKey = await db.apiKey.findUnique({
      where: { id: input.id, teamId: ctx.team.id },
    });
    if (!apiKey) {
      throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });
    }

    return next({ ctx: { ...ctx, apiKey } });
  });

export const contactBookProcedure = teamProcedure
  .input(
    z.object({
      contactBookId: z.string(),
    })
  )
  .use(async ({ ctx, next, input }) => {
    const contactBook = await db.contactBook.findUnique({
      where: { id: input.contactBookId, teamId: ctx.team.id },
    });
    if (!contactBook) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contact book not found",
      });
    }

    return next({ ctx: { ...ctx, contactBook } });
  });

export const campaignProcedure = teamProcedure
  .input(
    z.object({
      campaignId: z.string(),
    })
  )
  .use(async ({ ctx, next, input }) => {
    const campaign = await db.campaign.findUnique({
      where: { id: input.campaignId, teamId: ctx.team.id },
    });
    if (!campaign) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Campaign not found",
      });
    }

    return next({ ctx: { ...ctx, campaign } });
  });

export const templateProcedure = teamProcedure
  .input(
    z.object({
      templateId: z.string(),
    })
  )
  .use(async ({ ctx, next, input }) => {
    const template = await db.template.findUnique({
      where: { id: input.templateId, teamId: ctx.team.id },
    });
    if (!template) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Template not found",
      });
    }

    return next({ ctx: { ...ctx, template } });
  });

/**
 * To manage application settings, for hosted version, authenticated users will be considered as admin
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (env.NEXT_PUBLIC_IS_CLOUD && ctx.session.user.email !== env.ADMIN_EMAIL) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next();
});
