import { z } from "zod";
import { ApiPermission, Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { subDays, startOfDay, endOfDay } from "date-fns";

import {
  apiKeyProcedure,
  createTRPCRouter,
  teamProcedure,
} from "~/server/api/trpc";
import { addApiKey, deleteApiKey } from "~/server/service/api-service";

export const apiRouter = createTRPCRouter({
  createToken: teamProcedure
    .input(
      z.object({
        name: z.string(),
        permission: z.nativeEnum(ApiPermission),
        domainId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await addApiKey({
        name: input.name,
        permission: input.permission,
        teamId: ctx.team.id,
        domainId: input.domainId,
      });
    }),

  getApiKeys: teamProcedure.query(async ({ ctx }) => {
    const keys = await ctx.db.apiKey.findMany({
      where: {
        teamId: ctx.team.id,
      },
      select: {
        id: true,
        name: true,
        permission: true,
        partialToken: true,
        lastUsed: true,
        createdAt: true,
        domainId: true,
        domain: {
          select: {
            name: true,
          },
        },
      },
    });

    return keys;
  }),

  deleteApiKey: apiKeyProcedure.mutation(async ({ input }) => {
    return deleteApiKey(input.id);
  }),

  // Get API usage statistics for all keys
  getApiUsage: teamProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const startDate = startOfDay(subDays(new Date(), input.days));

      // Get usage per API key
      const usageByKey = await ctx.db.$queryRaw<
        Array<{
          apiId: number | null;
          apiName: string | null;
          total: bigint;
          delivered: bigint;
          bounced: bigint;
          failed: bigint;
        }>
      >`
        SELECT
          e."apiId",
          ak.name as "apiName",
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE e."latestStatus" = 'DELIVERED') as delivered,
          COUNT(*) FILTER (WHERE e."latestStatus" = 'BOUNCED') as bounced,
          COUNT(*) FILTER (WHERE e."latestStatus" = 'FAILED') as failed
        FROM "Email" e
        LEFT JOIN "ApiKey" ak ON e."apiId" = ak.id
        WHERE e."teamId" = ${ctx.team.id}
          AND e."createdAt" >= ${startDate}
        GROUP BY e."apiId", ak.name
        ORDER BY total DESC
      `;

      // Get daily usage
      const dailyUsage = await ctx.db.$queryRaw<
        Array<{
          date: Date;
          total: bigint;
          delivered: bigint;
          bounced: bigint;
        }>
      >`
        SELECT
          DATE_TRUNC('day', e."createdAt") as date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE e."latestStatus" = 'DELIVERED') as delivered,
          COUNT(*) FILTER (WHERE e."latestStatus" = 'BOUNCED') as bounced
        FROM "Email" e
        WHERE e."teamId" = ${ctx.team.id}
          AND e."createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', e."createdAt")
        ORDER BY date ASC
      `;

      // Get total stats
      const totalStats = await ctx.db.email.aggregate({
        where: {
          teamId: ctx.team.id,
          createdAt: { gte: startDate },
        },
        _count: true,
      });

      return {
        byKey: usageByKey.map((row) => ({
          apiId: row.apiId,
          apiName: row.apiName ?? "Direct/Campaign",
          total: Number(row.total),
          delivered: Number(row.delivered),
          bounced: Number(row.bounced),
          failed: Number(row.failed),
          deliveryRate:
            Number(row.total) > 0
              ? (Number(row.delivered) / Number(row.total)) * 100
              : 0,
        })),
        daily: dailyUsage.map((row) => ({
          date: row.date.toISOString().split("T")[0],
          total: Number(row.total),
          delivered: Number(row.delivered),
          bounced: Number(row.bounced),
        })),
        totalEmails: totalStats._count,
        period: input.days,
      };
    }),

  // Get detailed usage for a specific API key
  getApiKeyUsage: apiKeyProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const startDate = startOfDay(subDays(new Date(), input.days));

      const stats = await ctx.db.email.groupBy({
        by: ["latestStatus"],
        where: {
          apiId: input.id,
          createdAt: { gte: startDate },
        },
        _count: true,
      });

      const dailyUsage = await ctx.db.$queryRaw<
        Array<{
          date: Date;
          total: bigint;
        }>
      >`
        SELECT
          DATE_TRUNC('day', "createdAt") as date,
          COUNT(*) as total
        FROM "Email"
        WHERE "apiId" = ${input.id}
          AND "createdAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `;

      const statusCounts = stats.reduce(
        (acc, s) => {
          acc[s.latestStatus] = s._count;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        statusBreakdown: statusCounts,
        daily: dailyUsage.map((row) => ({
          date: row.date.toISOString().split("T")[0],
          total: Number(row.total),
        })),
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      };
    }),
});
