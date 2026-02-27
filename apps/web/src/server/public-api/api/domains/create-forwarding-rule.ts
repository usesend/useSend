import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import { db } from "~/server/db";

const route = createRoute({
  method: "post",
  path: "/v1/domains/{id}/forwarding-rules",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: { name: "id", in: "path" },
        example: 1,
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            sourceAddress: z.string().min(1).regex(/^[a-zA-Z0-9._%+-]+$/),
            destinationAddress: z.string().email(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            sourceAddress: z.string(),
            destinationAddress: z.string(),
            enabled: z.boolean(),
          }),
        },
      },
      description: "Create a forwarding rule",
    },
  },
});

function createForwardingRule(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const domainId = c.req.valid("param").id;
    const body = c.req.valid("json");

    const domain = await db.domain.findUnique({
      where: { id: domainId, teamId: team.id },
    });

    if (!domain) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    if (domain.status !== "SUCCESS") {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Domain must be verified",
      });
    }

    if (!domain.inboundEnabled) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Inbound email receiving must be enabled first",
      });
    }

    const sourceAddress = body.sourceAddress.toLowerCase();

    const existing = await db.emailForwardingRule.findUnique({
      where: {
        domainId_sourceAddress: { domainId, sourceAddress },
      },
    });

    if (existing) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: `A forwarding rule for ${sourceAddress}@${domain.name} already exists`,
      });
    }

    const rule = await db.emailForwardingRule.create({
      data: {
        teamId: team.id,
        domainId,
        sourceAddress,
        destinationAddress: body.destinationAddress,
      },
    });

    return c.json(
      {
        id: rule.id,
        sourceAddress: rule.sourceAddress,
        destinationAddress: rule.destinationAddress,
        enabled: rule.enabled,
      },
      201
    );
  });
}

export default createForwardingRule;
