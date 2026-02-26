import { createRoute, z } from "@hono/zod-openapi";
import { DomainSchema } from "~/lib/zod/domain-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import {
  getDomain as getDomainService,
  resolveDomainId,
} from "~/server/service/domain-service";

const route = createRoute({
  method: "get",
  path: "/v1/domains/{id}",
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({
          param: { name: "id", in: "path" },
          example: "dom_3NfPq7hK9a2Tj6Rx",
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
    const identifier = c.req.valid("param").id;
    const domainId = await resolveDomainId(identifier, team.id);

    if (!domainId) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    // Enforce API key domain restriction (if any)
    if (team.apiKey.domainId && team.apiKey.domainId !== domainId) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    // Re-use service logic to enrich domain (verification status, DNS records, etc.)
    let enriched;
    try {
      enriched = await getDomainService(domainId, team.id);
    } catch (e) {
      throw new UnsendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: e instanceof Error ? e.message : "Internal server error",
      });
    }

    return c.json(enriched);
  });
}

export default getDomain;
