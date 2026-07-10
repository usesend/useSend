import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const invitationRouter = createTRPCRouter({
  getUserInvites: protectedProcedure
    .input(
      z.object({
        inviteId: z.string().optional().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.email) {
        return [];
      }

      const invites = await ctx.db.teamInvite.findMany({
        where: {
          ...(input.inviteId ? { id: input.inviteId } : {}),
          email: { equals: ctx.session.user.email, mode: "insensitive" },
          expiresAt: { gt: new Date() },
        },
        include: {
          team: true,
        },
      });

      return invites;
    }),

  getInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.email) return null;

      const invite = await ctx.db.teamInvite.findFirst({
        where: {
          id: input.inviteId,
          email: { equals: ctx.session.user.email, mode: "insensitive" },
          expiresAt: { gt: new Date() },
        },
      });

      return invite;
    }),

  acceptTeamInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.email) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      await ctx.db.$transaction(async (tx) => {
        const invite = await tx.teamInvite.findFirst({
          where: {
            id: input.inviteId,
            email: {
              equals: ctx.session.user.email!,
              mode: "insensitive",
            },
            expiresAt: { gt: new Date() },
          },
        });

        if (!invite) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invite not found",
          });
        }

        await tx.teamUser.create({
          data: {
            teamId: invite.teamId,
            userId: ctx.session.user.id,
            role: invite.role,
          },
        });

        await tx.teamInvite.delete({ where: { id: invite.id } });
      });

      return true;
    }),
});
