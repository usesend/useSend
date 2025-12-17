import { z } from "zod";
import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { LimitService } from "~/server/service/limit-service";
import { LimitReason } from "~/lib/constants/plans";

export const limitsRouter = createTRPCRouter({
  get: teamProcedure
    .input(
      z.object({
        type: z.nativeEnum(LimitReason),
      }),
    )
    .query(async ({ ctx, input }) => {
      switch (input.type) {
        case LimitReason.CONTACT_BOOK:
          return LimitService.checkContactBookLimit(ctx.team.id);
        case LimitReason.DOMAIN:
          return LimitService.checkDomainLimit(ctx.team.id);
        case LimitReason.TEAM_MEMBER:
          return LimitService.checkTeamMemberLimit(ctx.team.id);
        case LimitReason.WEBHOOK:
          return LimitService.checkWebhookLimit(ctx.team.id);
        default:
          // exhaustive guard
          throw new Error("Unsupported limit type");
      }
    }),
});
