import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { LimitService } from "~/server/service/limit-service";
import { withPlanLimitLock } from "~/server/service/plan-limit-lock";

/**
 * Invites belong to the email address they were sent to. Only a signed-in user
 * with that email may see or accept them; knowing an invite id is not enough.
 */
function inviteEmailFilter(email: string) {
  return { equals: email.trim(), mode: "insensitive" as const };
}

export const invitationRouter = createTRPCRouter({
  getUserInvites: protectedProcedure
    .input(
      z.object({
        inviteId: z.string().optional().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.session.user.email) {
        return [];
      }

      const invites = await ctx.db.teamInvite.findMany({
        where: {
          email: inviteEmailFilter(ctx.session.user.email),
          ...(input.inviteId ? { id: input.inviteId } : {}),
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
      if (!ctx.session.user.email) {
        return null;
      }

      const invite = await ctx.db.teamInvite.findFirst({
        where: {
          id: input.inviteId,
          email: inviteEmailFilter(ctx.session.user.email),
        },
      });

      return invite;
    }),

  acceptTeamInvite: protectedProcedure
    .input(z.object({ inviteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session.user.email;

      const invite = email
        ? await ctx.db.teamInvite.findFirst({
            where: {
              id: input.inviteId,
              email: inviteEmailFilter(email),
            },
          })
        : null;

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      // Pending invites don't count toward the seat limit, so check it again
      // when someone actually joins, one join at a time per team.
      await withPlanLimitLock(invite.teamId, "teamMember", async () => {
        const { isLimitReached } = await LimitService.checkTeamMemberLimit(
          invite.teamId,
        );
        if (isLimitReached) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This team has reached its member limit",
          });
        }

        await ctx.db.$transaction([
          ctx.db.teamUser.create({
            data: {
              teamId: invite.teamId,
              userId: ctx.session.user.id,
              role: invite.role,
            },
          }),
          ctx.db.teamInvite.delete({
            where: {
              id: invite.id,
            },
          }),
        ]);
      });
      // No need to invalidate cache here again

      return true;
    }),
});
