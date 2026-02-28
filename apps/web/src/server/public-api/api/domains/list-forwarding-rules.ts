import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import { db } from "~/server/db";

const ForwardingRuleSchema = z.object({
  id: z.string(),
  sourceAddress: z.string(),
  destinationAddress: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const route = createRoute({
  method: "get",
  path: "/v1/domains/{id}/forwarding-rules",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: { name: "id", in: "path" },
        example: 1,
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ data: z.array(ForwardingRuleSchema) }),
        },
      },
      description: "List forwarding rules for a domain",
    },
  },
});

function listForwardingRules(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const domainId = c.req.valid("param").id;

    const domain = await db.domain.findUnique({
      where: { id: domainId, teamId: team.id },
    });

    if (!domain) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    const rules = await db.emailForwardingRule.findMany({
      where: { domainId, teamId: team.id },
      orderBy: { createdAt: "desc" },
    });

    return c.json({
      data: rules.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  });
}

export default listForwardingRules;
