import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import { db } from "~/server/db";

const route = createRoute({
  method: "delete",
  path: "/v1/domains/{id}/forwarding-rules/{ruleId}",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: { name: "id", in: "path" },
        example: 1,
      }),
      ruleId: z.string().openapi({
        param: { name: "ruleId", in: "path" },
        example: "clx1234567890",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: "Delete a forwarding rule",
    },
  },
});

function deleteForwardingRule(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const { id: domainId, ruleId } = c.req.valid("param");

    const rule = await db.emailForwardingRule.findFirst({
      where: { id: ruleId, domainId, teamId: team.id },
    });

    if (!rule) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Forwarding rule not found",
      });
    }

    await db.emailForwardingRule.delete({
      where: { id: ruleId },
    });

    return c.json({ success: true });
  });
}

export default deleteForwardingRule;
