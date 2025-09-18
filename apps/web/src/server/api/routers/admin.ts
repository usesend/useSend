import { Prisma, type Plan } from "@prisma/client";
import { format, startOfMonth } from "date-fns";
import { z } from "zod";
import { env } from "~/env";

import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import { getAccount } from "~/server/aws/ses";
import { db } from "~/server/db";
import { sendMail } from "~/server/mailer";
import { logger } from "~/server/logger/log";

const waitlistUserSelection = {
  id: true,
  email: true,
  name: true,
  isWaitlisted: true,
  createdAt: true,
} as const;

function toPlainHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return `<pre style="font-family: inherit; white-space: pre-wrap; margin: 0;">${escaped}</pre>`;
}

function formatDisplayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email;
  const pieces = localPart.split(/[._-]+/).filter(Boolean);
  if (pieces.length === 0) {
    return localPart;
  }
  return pieces
    .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
    .join(" ");
}

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
      })
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
      })
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
      })
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
      })
    )
    .query(async ({ input }) => {
      return SesSettingsService.getSetting(
        input.region ?? env.AWS_DEFAULT_REGION
      );
    }),

  findUserByEmail: adminProcedure
    .input(
      z.object({
        email: z
          .string()
          .email()
          .transform((value) => value.toLowerCase()),
      })
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
      })
    )
    .mutation(async ({ input }) => {
      const existingUser = await db.user.findUnique({
        where: { id: input.userId },
        select: waitlistUserSelection,
      });

      if (!existingUser) {
        throw new Error("User not found");
      }

      const updatedUser = await db.user.update({
        where: { id: input.userId },
        data: { isWaitlisted: input.isWaitlisted },
        select: waitlistUserSelection,
      });

      const founderEmail = env.FOUNDER_EMAIL ?? undefined;
      const fallbackFrom = env.FROM_EMAIL ?? env.ADMIN_EMAIL ?? undefined;

      const shouldSendAcceptanceEmail =
        existingUser.isWaitlisted &&
        !input.isWaitlisted &&
        Boolean(updatedUser.email) &&
        (founderEmail || fallbackFrom);

      if (shouldSendAcceptanceEmail) {
        const recipient = updatedUser.email as string;
        const replyTo = founderEmail ?? fallbackFrom;
        const fromOverride = founderEmail ?? undefined;
        const founderName = replyTo
          ? formatDisplayNameFromEmail(replyTo)
          : "Founder";
        const userFirstName =
          updatedUser.name?.split(" ")[0] ?? updatedUser.name ?? recipient;

        const text = `Hey ${userFirstName},\n\nThanks for hanging in while we reviewed your waitlist request. I've just moved your account off the waitlist, so you now have full access to useSend.\n\nGo ahead and log back in to start sending: ${env.NEXTAUTH_URL}\n\nIf anything feels unclear or you want help getting set up, reply to this email and it comes straight to me.\n\nCheers,\n${founderName}\n${replyTo}`;

        try {
          await sendMail(
            recipient,
            "useSend: You're off the waitlist",
            text,
            toPlainHtml(text),
            replyTo,
            fromOverride
          );
        } catch (error) {
          logger.error(
            { userId: updatedUser.id, error },
            "Failed to send waitlist acceptance email"
          );
        }
      }

      return updatedUser;
    }),

  findTeam: adminProcedure
    .input(
      z.object({
        query: z
          .string({ required_error: "Search query is required" })
          .trim()
          .min(1, "Search query is required"),
      })
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
      })
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

  getEmailAnalytics: adminProcedure
    .input(
      z.object({
        timeframe: z.enum(["today", "thisMonth"]),
        paidOnly: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const timeframe = input.timeframe;
      const paidOnly = input.paidOnly ?? false;

      const today = format(new Date(), "yyyy-MM-dd");
      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

      type EmailAnalyticsRow = {
        teamId: number;
        name: string;
        plan: Plan;
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        bounced: number;
        complained: number;
        hardBounced: number;
      };

      const rows = await db.$queryRaw<Array<EmailAnalyticsRow>>`
        SELECT
          d."teamId" AS "teamId",
          t."name" AS name,
          t."plan" AS plan,
          SUM(d.sent)::integer AS sent,
          SUM(d.delivered)::integer AS delivered,
          SUM(d.opened)::integer AS opened,
          SUM(d.clicked)::integer AS clicked,
          SUM(d.bounced)::integer AS bounced,
          SUM(d.complained)::integer AS complained,
          SUM(d."hardBounced")::integer AS "hardBounced"
        FROM "DailyEmailUsage" d
        INNER JOIN "Team" t ON t.id = d."teamId"
        WHERE 1 = 1
        ${
          timeframe === "today"
            ? Prisma.sql`AND d."date" = ${today}`
            : Prisma.sql`AND d."date" >= ${monthStart}`
        }
        ${paidOnly ? Prisma.sql`AND t."plan" = 'BASIC'` : Prisma.sql``}
        GROUP BY d."teamId", t."name", t."plan"
        ORDER BY sent DESC
      `;

      const totals = rows.reduce(
        (acc, row) => {
          acc.sent += row.sent;
          acc.delivered += row.delivered;
          acc.opened += row.opened;
          acc.clicked += row.clicked;
          acc.bounced += row.bounced;
          acc.complained += row.complained;
          acc.hardBounced += row.hardBounced;
          return acc;
        },
        {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          complained: 0,
          hardBounced: 0,
        }
      );

      return {
        rows,
        totals,
        timeframe,
        paidOnly,
        periodStart: timeframe === "today" ? today : monthStart,
      };
    }),
});
