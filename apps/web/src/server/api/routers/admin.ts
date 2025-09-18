import { z } from "zod";
import { env } from "~/env";

import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import { getAccount } from "~/server/aws/ses";
import { db } from "~/server/db";

const waitlistUserSelection = {
  id: true,
  email: true,
  name: true,
  isWaitlisted: true,
  createdAt: true,
} as const;

const teamAdminSelection = {
  id: true,
  name: true,
  plan: true,
  apiRateLimit: true,
  dailyEmailLimit: true,
  isBlocked: true,
  billingEmail: true,
  createdAt: true,
  teamUsers: {
    select: {
      role: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  },
  domains: {
    select: {
      id: true,
      name: true,
      status: true,
      isVerifying: true,
    },
  },
} as const;

export const adminRouter = createTRPCRouter({
  getSesSettings: adminProcedure.query(async () => {
    return SesSettingsService.getAllSettings();
  }),

  getQuotaForRegion: adminProcedure
    .input(
      z.object({
        region: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const acc = await getAccount(input.region);
      return acc.SendQuota?.MaxSendRate;
    }),

  addSesSettings: adminProcedure
    .input(
      z.object({
        region: z.string(),
        usesendUrl: z.string().url(),
        sendRate: z.number(),
        transactionalQuota: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      return SesSettingsService.createSesSetting({
        region: input.region,
        usesendUrl: input.usesendUrl,
        sendingRateLimit: input.sendRate,
        transactionalQuota: input.transactionalQuota,
      });
    }),

  updateSesSettings: adminProcedure
    .input(
      z.object({
        settingsId: z.string(),
        sendRate: z.number(),
        transactionalQuota: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      return SesSettingsService.updateSesSetting({
        id: input.settingsId,
        sendingRateLimit: input.sendRate,
        transactionalQuota: input.transactionalQuota,
      });
    }),

  getSetting: adminProcedure
    .input(
      z.object({
        region: z.string().optional().nullable(),
      }),
    )
    .query(async ({ input }) => {
      return SesSettingsService.getSetting(
        input.region ?? env.AWS_DEFAULT_REGION,
      );
    }),

  findUserByEmail: adminProcedure
    .input(
      z.object({
        email: z
          .string()
          .email()
          .transform((value) => value.toLowerCase()),
      }),
    )
    .mutation(async ({ input }) => {
      const user = await db.user.findUnique({
        where: { email: input.email },
        select: waitlistUserSelection,
      });

      return user ?? null;
    }),

  updateUserWaitlist: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        isWaitlisted: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const updatedUser = await db.user.update({
        where: { id: input.userId },
        data: { isWaitlisted: input.isWaitlisted },
        select: waitlistUserSelection,
      });

      return updatedUser;
    }),

  findTeam: adminProcedure
    .input(
      z.object({
        query: z
          .string({ required_error: "Search query is required" })
          .trim()
          .min(1, "Search query is required"),
      }),
    )
    .mutation(async ({ input }) => {
      const query = input.query.trim();

      let numericId: number | null = null;
      if (/^\d+$/.test(query)) {
        numericId = Number(query);
      }

      let team = numericId
        ? await db.team.findUnique({
            where: { id: numericId },
            select: teamAdminSelection,
          })
        : null;

      if (!team) {
        team = await db.team.findFirst({
          where: {
            OR: [
              { name: { equals: query, mode: "insensitive" } },
              { billingEmail: { equals: query, mode: "insensitive" } },
              {
                teamUsers: {
                  some: {
                    user: {
                      email: { equals: query, mode: "insensitive" },
                    },
                  },
                },
              },
              {
                domains: {
                  some: {
                    name: { equals: query, mode: "insensitive" },
                  },
                },
              },
            ],
          },
          select: teamAdminSelection,
        });
      }

      return team ?? null;
    }),

  updateTeamSettings: adminProcedure
    .input(
      z.object({
        teamId: z.number(),
        apiRateLimit: z.number().int().min(1).max(10_000),
        dailyEmailLimit: z.number().int().min(0).max(10_000_000),
        isBlocked: z.boolean(),
        plan: z.enum(["FREE", "BASIC"]),
      }),
    )
    .mutation(async ({ input }) => {
      const { teamId, ...data } = input;

      const updatedTeam = await db.team.update({
        where: { id: teamId },
        data,
        select: teamAdminSelection,
      });

      return updatedTeam;
    }),
});
