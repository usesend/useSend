import { Email, EmailStatus, Prisma } from "@prisma/client";
import { format, subDays } from "date-fns";
import { z } from "zod";
import { DEFAULT_QUERY_LIMIT } from "~/lib/constants";
import { BOUNCE_ERROR_MESSAGES } from "~/lib/constants/ses-errors";
import type { SesBounce } from "~/types/aws-types";

import {
  createTRPCRouter,
  emailProcedure,
  teamProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { cancelEmail, updateEmail } from "~/server/service/email-service";

const statuses = Object.values(EmailStatus) as [EmailStatus];

const getBounceReason = (data: Prisma.JsonValue) => {
  const bounce = data as unknown as SesBounce;
  if (bounce.bouncedRecipients?.[0]?.diagnosticCode) {
    return bounce.bouncedRecipients[0].diagnosticCode;
  }
  if (bounce.bounceType === "Permanent") {
    return BOUNCE_ERROR_MESSAGES.Permanent[
      bounce.bounceSubType as
        | "General"
        | "NoEmail"
        | "Suppressed"
        | "OnAccountSuppressionList"
    ];
  }
  if (bounce.bounceType === "Transient") {
    return BOUNCE_ERROR_MESSAGES.Transient[
      bounce.bounceSubType as
        | "General"
        | "MailboxFull"
        | "MessageTooLarge"
        | "ContentRejected"
        | "AttachmentRejected"
    ];
  }
  if (bounce.bounceType === "Undetermined") {
    return BOUNCE_ERROR_MESSAGES.Undetermined;
  }
  return undefined;
};

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
          bounceData: Prisma.JsonValue | null;
        }>
      >`
        SELECT
          e."to",
          e."latestStatus",
          e.subject,
          e."scheduledAt",
          e."createdAt",
          b.data as "bounceData"
        FROM "Email" e
        LEFT JOIN LATERAL (
          SELECT data
          FROM "EmailEvent"
          WHERE "emailId" = e.id AND "status" = 'BOUNCED'
          ORDER BY "createdAt" DESC
          LIMIT 1
        ) b ON true
        WHERE e."teamId" = ${ctx.team.id}
        ${
          input.status
            ? Prisma.sql`AND e."latestStatus"::text = ${input.status}`
            : Prisma.sql``
        }
        ${
          input.domain
            ? Prisma.sql`AND e."domainId" = ${input.domain}`
            : Prisma.sql``
        }
        ${
          input.apiId
            ? Prisma.sql`AND e."apiId" = ${input.apiId}`
            : Prisma.sql``
        }
        ${
          input.search
            ? Prisma.sql`AND (
          e."subject" ILIKE ${`%${input.search}%`}
          OR EXISTS (
            SELECT 1 FROM unnest(e."to") AS email
            WHERE email ILIKE ${`%${input.search}%`}
          )
        )`
            : Prisma.sql``
        }
        ORDER BY e."createdAt" DESC
        LIMIT 10000
      `;

      return emails.map((email) => ({
        to: email.to.join("; "),
        status: email.latestStatus,
        subject: email.subject,
        sentAt: (email.scheduledAt ?? email.createdAt).toISOString(),
        bounceReason:
          email.latestStatus === "BOUNCED" && email.bounceData
            ? getBounceReason(email.bounceData)
            : undefined,
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
