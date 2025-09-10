import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { getTeamFromToken } from "~/server/public-api/auth";
import { db } from "~/server/db";
import { EmailStatus } from "@prisma/client";
import { UnsendApiError } from "../../api-error";

const route = createRoute({
  method: "get",
  path: "/v1/emails/{emailId}",
  request: {
    params: z.object({
      emailId: z
        .string()
        .min(3)
        .openapi({
          param: {
            name: "emailId",
            in: "path",
          },
          example: "cuiwqdj74rygf74",
        }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            teamId: z.number(),
            to: z.string().or(z.array(z.string())),
            replyTo: z.string().or(z.array(z.string())).optional(),
            cc: z.string().or(z.array(z.string())).optional(),
            bcc: z.string().or(z.array(z.string())).optional(),
            from: z.string(),
            subject: z.string(),
            html: z.string().nullable(),
            text: z.string().nullable(),
            createdAt: z.string(),
            updatedAt: z.string(),
            emailEvents: z.array(
              z.object({
                emailId: z.string(),
                status: z.nativeEnum(EmailStatus),
                createdAt: z.string(),
                data: z.any().optional(),
              })
            ),
          }),
        },
      },
      description: "Retrieve the email",
    },
  },
});

function send(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const emailId = c.req.param("emailId");

    const whereClause: { id: string; teamId: number; domainId?: number } = {
      id: emailId,
      teamId: team.id,
    };

    if (team.apiKey.domainId !== null) {
      whereClause.domainId = team.apiKey.domainId;
    }

    const email = await db.email.findUnique({
      where: whereClause,
      select: {
        id: true,
        teamId: true,
        to: true,
        from: true,
        subject: true,
        html: true,
        text: true,
        createdAt: true,
        updatedAt: true,
        emailEvents: {
          select: {
            emailId: true,
            status: true,
            createdAt: true,
            data: true,
          },
        },
      },
    });

    if (!email) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Email not found",
      });
    }

    return c.json(email);
  });
}

export default send;
