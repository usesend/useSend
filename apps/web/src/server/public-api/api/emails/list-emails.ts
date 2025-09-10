import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { db } from "~/server/db";
import { EmailStatus, Prisma } from "@prisma/client";
import { DEFAULT_QUERY_LIMIT } from "~/lib/constants";

const EmailSchema = z.object({
  id: z.string(),
  to: z.string().or(z.array(z.string())),
  replyTo: z.string().or(z.array(z.string())).optional().nullable(),
  cc: z.string().or(z.array(z.string())).optional().nullable(),
  bcc: z.string().or(z.array(z.string())).optional().nullable(),
  from: z.string(),
  subject: z.string(),
  html: z.string().nullable(),
  text: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestStatus: z.nativeEnum(EmailStatus).nullable(),
  scheduledAt: z.string().datetime().nullable(),
  domainId: z.number().nullable(),
});

const route = createRoute({
  method: "get",
  path: "/v1/emails",
  request: {
    query: z.object({
      page: z
        .string()
        .optional()
        .default("1")
        .transform(Number)
        .openapi({
          param: {
            name: "page",
            in: "query",
          },
          example: "1",
        }),
      limit: z
        .string()
        .optional()
        .default(String(DEFAULT_QUERY_LIMIT))
        .pipe(z.coerce.number().min(1).max(DEFAULT_QUERY_LIMIT))
        .openapi({
          param: {
            name: "limit",
            in: "query",
          },
          example: String(DEFAULT_QUERY_LIMIT),
        }),
      startDate: z
        .string()
        .datetime()
        .optional()
        .openapi({
          param: {
            name: "startDate",
            in: "query",
          },
          example: "2024-01-01T00:00:00Z",
        }),
      endDate: z
        .string()
        .datetime()
        .optional()
        .openapi({
          param: {
            name: "endDate",
            in: "query",
          },
          example: "2024-01-31T23:59:59Z",
        }),
      domainId: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((val) => {
          if (!val) return undefined;
          return (Array.isArray(val) ? val : [val]).map(Number);
        })
        .openapi({
          param: {
            name: "domainId",
            in: "query",
          },
          example: "123", // or ["123", "456"]
        }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(EmailSchema),
            count: z.number(),
          }),
        },
      },
      description: "Retrieve a list of emails",
    },
  },
});

function listEmails(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const { page, limit, startDate, endDate, domainId } = c.req.valid("query");

    const whereClause: Prisma.EmailWhereInput = {
      teamId: team.id,
    };

    if (startDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
      };
    }
    if (endDate) {
      whereClause.createdAt = {
        lte: new Date(endDate),
      };
    }

    if (team.apiKey.domainId !== null) {
      whereClause.domainId = team.apiKey.domainId;
    } else if (domainId && domainId.length > 0) {
      whereClause.domainId = { in: domainId };
    }

    const [emails, count] = await db.$transaction([
      db.email.findMany({
        where: whereClause,
        select: {
          id: true,
          to: true,
          replyTo: true,
          cc: true,
          bcc: true,
          from: true,
          subject: true,
          html: true,
          text: true,
          createdAt: true,
          updatedAt: true,
          latestStatus: true,
          scheduledAt: true,
          domainId: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.email.count({ where: whereClause }),
    ]);

    return c.json({
      data: emails.map((email) => ({
        ...email,
        createdAt: email.createdAt.toISOString(),
        updatedAt: email.updatedAt.toISOString(),
        scheduledAt: email.scheduledAt ? email.scheduledAt.toISOString() : null,
      })),
      count,
    });
  });
}

export default listEmails;
