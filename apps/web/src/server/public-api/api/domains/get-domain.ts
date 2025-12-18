import { createRoute, z } from "@hono/zod-openapi";
import { DomainSchema } from "~/lib/zod/domain-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UseSendApiError } from "../../api-error";
import { db } from "~/server/db";
import { getDomain as getDomainService } from "~/server/service/domain-service";

const route = createRoute({
  method: "get",
  path: "/v1/domains/{id}",
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
          schema: DomainSchema,
        },
      },
      description: "Retrieve the domain",
    },
  },
});

function getDomain(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const id = c.req.valid("param").id;

    // Enforce API key domain restriction (if any)
    if (team.apiKey.domainId && team.apiKey.domainId !== id) {
      throw new UseSendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    // Re-use service logic to enrich domain (verification status, DNS records, etc.)
    let enriched;
    try {
      enriched = await getDomainService(id, team.id);
    } catch (e) {
      throw new UseSendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: e instanceof Error ? e.message : "Internal server error",
      });
    }

    return c.json(enriched);
  });
}

export default getDomain;
