import { Prisma, type Plan } from "@prisma/client";
import { z } from "zod";
import { env } from "~/env";

import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { SesSettingsService } from "~/server/service/ses-settings-service";
import { getAccount } from "~/server/aws/ses";
import { db } from "~/server/db";
import { sendMail } from "~/server/mailer";
import { logger } from "~/server/logger/log";
import { UseSend } from "usesend-js";
import { isCloud } from "~/utils/common";
import { toPlainHtml } from "~/server/utils/email-content";

const waitlistUserSelection = {
  id: true,
  email: true,
  name: true,
  isWaitlisted: true,
  createdAt: true,
} as const;

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

      // Add user to contact book when removed from waitlist (cloud only)
      if (
        existingUser.isWaitlisted &&
        !input.isWaitlisted &&
        isCloud() &&
        env.CONTACT_BOOK_ID &&
        updatedUser.email
      ) {
        try {
          const client = new UseSend(env.USESEND_API_KEY);

          // Split name into first and last name if available
          const firstName = updatedUser.name || "";

          const result = await client.contacts.create(env.CONTACT_BOOK_ID, {
            email: updatedUser.email,
            firstName: firstName,
          });

          if (result.error) {
            logger.error(
              {
                userId: updatedUser.id,
                email: updatedUser.email,
                error: result.error,
              },
              "Failed to add user to contact book",
            );
          } else {
            logger.info(
              {
                userId: updatedUser.id,
                email: updatedUser.email,
                contactId: result.data?.contactId,
              },
              "Successfully added user to contact book",
            );
          }
        } catch (error) {
          logger.error(
            {
              userId: updatedUser.id,
              email: updatedUser.email,
              error,
            },
            "Error adding user to contact book",
          );
        }
      }

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
            fromOverride,
          );
        } catch (error) {
          logger.error(
            { userId: updatedUser.id, error },
            "Failed to send waitlist acceptance email",
          );
        }
      }

      return updatedUser;
    }),

  rejectWaitlistUser: adminProcedure
    .input(
      z.object({
        userId: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: waitlistUserSelection,
      });

      if (!user) {
        throw new Error("User not found");
      }

      if (!user.email) {
        throw new Error("User email is missing");
      }

      const founderEmail = env.FOUNDER_EMAIL ?? undefined;
      const fallbackFrom = env.FROM_EMAIL ?? env.ADMIN_EMAIL ?? undefined;

      const replyTo = founderEmail ?? fallbackFrom;

      if (!replyTo) {
        throw new Error("No sender email configured");
      }

      const fromOverride = founderEmail ?? undefined;

      const text = [
        "Hello,",
        "",
        "Sorry, We cannot proceed with this request at this time, this might affect useSend\u2019s sending reputation.",
        "",
        "",
        "cheers,",
        "koushik - useSend.com",
      ].join("\n");

      try {
        await sendMail(
          user.email,
          "useSend: Waitlist request update",
          text,
          toPlainHtml(text),
          replyTo,
          fromOverride,
        );
      } catch (error) {
        logger.error(
          { userId: user.id, error },
          "Failed to send waitlist rejection email",
        );
        throw new Error("Failed to send waitlist rejection email");
      }

      return { sent: true };
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
              {
                subscription: {
                  some: {
                    id: { equals: query, mode: "insensitive" },
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

  getEmailAnalytics: adminProcedure
    .input(
      z.object({
        timeframe: z.enum(["today", "thisMonth"]),
        paidOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const timeframe = input.timeframe;
      const paidOnly = input.paidOnly ?? false;

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const monthStartDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const monthStart = monthStartDate.toISOString().slice(0, 10);

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
        },
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
