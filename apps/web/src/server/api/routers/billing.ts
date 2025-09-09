import { DailyEmailUsage, EmailUsageType, Subscription } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { format, sub } from "date-fns";
import { z } from "zod";
import { getThisMonthUsage } from "~/server/service/usage-service";

import {
  apiKeyProcedure,
  createTRPCRouter,
  teamAdminProcedure,
  teamProcedure,
} from "~/server/api/trpc";
import {
  createCheckoutSessionForTeam,
  getManageSessionUrl,
} from "~/server/billing/payments";
import { db } from "~/server/db";
import { TeamService } from "~/server/service/team-service";

export const billingRouter = createTRPCRouter({
  createCheckoutSession: teamAdminProcedure.mutation(async ({ ctx }) => {
    return (await createCheckoutSessionForTeam(ctx.team.id)).url;
  }),

  getManageSessionUrl: teamAdminProcedure.mutation(async ({ ctx }) => {
    return await getManageSessionUrl(ctx.team.id);
  }),

  getThisMonthUsage: teamProcedure.query(async ({ ctx }) => {
    return await getThisMonthUsage(ctx.team.id);
  }),

  getSubscriptionDetails: teamProcedure.query(async ({ ctx }) => {
    const subscription = await db.subscription.findFirst({
      where: { teamId: ctx.team.id },
      orderBy: { status: "asc" },
    });

    return subscription;
  }),

  updateBillingEmail: teamAdminProcedure
    .input(
      z.object({
        billingEmail: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { billingEmail } = input;

      await TeamService.updateTeam(ctx.team.id, { billingEmail });
    }),
});
