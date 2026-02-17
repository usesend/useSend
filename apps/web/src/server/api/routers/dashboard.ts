import { z } from "zod";
import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { emailTimeSeries, reputationMetricsData } from "~/server/service/dashboard-service";

export const dashboardRouter = createTRPCRouter({
  emailTimeSeries: teamProcedure
    .input(
      z.object({
        days: z.number().optional(),
        domain: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { team } = ctx;

      const response = await emailTimeSeries({team, days: input.days, domain: input.domain})

      return response
    }),

  reputationMetricsData: teamProcedure
    .input(
      z.object({
        domain: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { team } = ctx;
      const response = await reputationMetricsData({team, domain: input.domain})

      return response;
    }),
});
