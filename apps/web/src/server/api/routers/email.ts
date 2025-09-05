import { Email, EmailStatus, Prisma } from "@prisma/client";
import { format, subDays } from "date-fns";
import { z } from "zod";
import { DEFAULT_QUERY_LIMIT } from "~/lib/constants";

import {
  createTRPCRouter,
  emailProcedure,
  teamProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { cancelEmail, updateEmail } from "~/server/service/email-service";

const statuses = Object.values(EmailStatus) as [EmailStatus];

export const emailRouter = createTRPCRouter({
  emails: teamProcedure
    .input(
      z.object({
        page: z.number().optional(),
        status: z.enum(statuses).optional().nullable(),
        domain: z.number().optional(),
        search: z.string().optional().nullable(),
        apiId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = input.page || 1;
      const limit = DEFAULT_QUERY_LIMIT;
      const offset = (page - 1) * limit;

      const emails = await db.$queryRaw<Array<Email>>`
        SELECT 
          id, 
          "createdAt", 
          "latestStatus", 
          subject, 
          "to", 
          "scheduledAt"
        FROM "Email"
        WHERE "teamId" = ${ctx.team.id}
        ${input.status ? Prisma.sql`AND "latestStatus"::text = ${input.status}` : Prisma.sql``}
        ${input.domain ? Prisma.sql`AND "domainId" = ${input.domain}` : Prisma.sql``}
        ${input.apiId ? Prisma.sql`AND "apiId" = ${input.apiId}` : Prisma.sql``}
        ${
          input.search
            ? Prisma.sql`AND (
          "subject" ILIKE ${`%${input.search}%`} 
          OR EXISTS (
            SELECT 1 FROM unnest("to") AS email 
            WHERE email ILIKE ${`%${input.search}%`}
          )
        )`
            : Prisma.sql``
        }
        ORDER BY "createdAt" DESC
        LIMIT ${DEFAULT_QUERY_LIMIT}
        OFFSET ${offset}
      `;

      return { emails };
    }),

  exportEmails: teamProcedure
    .input(
      z.object({
        status: z.enum(statuses).optional().nullable(),
        domain: z.number().optional(),
        search: z.string().optional().nullable(),
        apiId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const emails = await db.$queryRaw<
        Array<{
          to: string[];
          latestStatus: EmailStatus;
          subject: string;
          scheduledAt: Date | null;
          createdAt: Date;
        }>
      >`
        SELECT
          "to",
          "latestStatus",
          subject,
          "scheduledAt",
          "createdAt"
        FROM "Email"
        WHERE "teamId" = ${ctx.team.id}
        ${input.status ? Prisma.sql`AND "latestStatus"::text = ${input.status}` : Prisma.sql``}
        ${input.domain ? Prisma.sql`AND "domainId" = ${input.domain}` : Prisma.sql``}
        ${input.apiId ? Prisma.sql`AND "apiId" = ${input.apiId}` : Prisma.sql``}
        ${
          input.search
            ? Prisma.sql`AND (
          "subject" ILIKE ${`%${input.search}%`}
          OR EXISTS (
            SELECT 1 FROM unnest("to") AS email
            WHERE email ILIKE ${`%${input.search}%`}
          )
        )`
            : Prisma.sql``
        }
        ORDER BY "createdAt" DESC
        LIMIT 10000
      `;

      return emails.map((email) => ({
        to: email.to.join("; "),
        status: email.latestStatus,
        subject: email.subject,
        sentAt: (email.scheduledAt ?? email.createdAt).toISOString(),
      }));
    }),

  getEmail: emailProcedure.query(async ({ input }) => {
    const email = await db.email.findUnique({
      where: {
        id: input.id,
      },
      select: {
        emailEvents: {
          orderBy: {
            status: "desc",
          },
        },
        id: true,
        createdAt: true,
        latestStatus: true,
        subject: true,
        to: true,
        from: true,
        domainId: true,
        text: true,
        html: true,
        scheduledAt: true,
      },
    });

    return email;
  }),

  cancelEmail: emailProcedure.mutation(async ({ input }) => {
    await cancelEmail(input.id);
  }),

  updateEmailScheduledAt: emailProcedure
    .input(z.object({ scheduledAt: z.string().datetime() }))
    .mutation(async ({ input }) => {
      await updateEmail(input.id, { scheduledAt: input.scheduledAt });
    }),
});
