import { z } from "zod";
import { ApiPermission } from "@prisma/client";

import {
  apiKeyProcedure,
  createTRPCRouter,
  teamProcedure,
} from "~/server/api/trpc";
import {
  addApiKey,
  deleteApiKey,
  updateApiKey,
} from "~/server/service/api-service";

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
      orderBy: {
        createdAt: "desc",
      },
    });

    return keys;
  }),

  updateApiKey: apiKeyProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        domainId: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await updateApiKey({
        id: input.id,
        teamId: ctx.team.id,
        name: input.name,
        domainId: input.domainId,
      });
    }),

  deleteApiKey: apiKeyProcedure.mutation(async ({ input }) => {
    return deleteApiKey(input.id);
  }),
});
