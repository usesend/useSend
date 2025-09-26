import { createRoute, z } from "@hono/zod-openapi";
import { DomainSchema } from "~/lib/zod/domain-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { getDomains as getDomainsService } from "~/server/service/domain-service";

const route = createRoute({
  method: "get",
  path: "/v1/domains",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(DomainSchema),
        },
      },
      description: "Retrieve domains accessible by the API key",
    },
  },
});

function getDomains(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    // If API key is restricted to a specific domain, only return that domain; else return all team domains
    const domains = await getDomainsService(team.id, {
      domainId: team.apiKey.domainId ?? undefined,
    });

    return c.json(domains);
  });
}

export default getDomains;
