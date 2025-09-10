import { createRoute, z } from "@hono/zod-openapi";
import { DomainSchema } from "~/lib/zod/domain-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { db } from "~/server/db";

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
    const domains = team.apiKey.domainId
      ? await db.domain.findMany({
          where: { teamId: team.id, id: team.apiKey.domainId },
        })
      : await db.domain.findMany({ where: { teamId: team.id } });

    return c.json(domains);
  });
}

export default getDomains;
