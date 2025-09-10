import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { getTeamFromToken } from "~/server/public-api/auth";
import { updateEmail } from "~/server/service/email-service";
import { checkIsValidEmailIdWithDomainRestriction } from "../../api-utils";

const route = createRoute({
  method: "patch",
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
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            scheduledAt: z.string().datetime(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ emailId: z.string().optional() }),
        },
      },
      description: "Retrieve the user",
    },
  },
});

function updateEmailScheduledAt(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const emailId = c.req.param("emailId");

    await checkIsValidEmailIdWithDomainRestriction(emailId, team.id, team.apiKey.domainId);

    await updateEmail(emailId, {
      scheduledAt: c.req.valid("json").scheduledAt,
    });

    return c.json({ emailId });
  });
}

export default updateEmailScheduledAt;
