import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "~/env";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TeamService } from "~/server/service/team-service";

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
          ...(input.inviteId
            ? { id: input.inviteId }
            : { email: ctx.session.user.email }),
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
      const invite = await ctx.db.teamInvite.findUnique({
        where: {
          id: input.inviteId,
        },
      });

      return invite;
    }),

  acceptTeamInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.teamInvite.findUnique({
        where: {
          id: input.inviteId,
        },
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      await ctx.db.teamUser.create({
        data: {
          teamId: invite.teamId,
          userId: ctx.session.user.id,
          role: invite.role,
        },
      });
      await TeamService.invalidateTeamCache(invite.teamId);

      await ctx.db.teamInvite.delete({
        where: {
          id: input.inviteId,
        },
      });
      // No need to invalidate cache here again

      return true;
    }),
});
