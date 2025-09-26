import { createRoute, z } from "@hono/zod-openapi";
import { DomainSchema } from "~/lib/zod/domain-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { createDomain as createDomainService } from "~/server/service/domain-service";

const route = createRoute({
  method: "post",
  path: "/v1/domains",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            name: z.string(),
            region: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: DomainSchema,
        },
      },
      description: "Create a new domain",
    },
  },
});

function createDomain(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const body = c.req.valid("json");
    const response = await createDomainService(
      team.id,
      body.name,
      body.region,
      team.sesTenantId ?? undefined
    );

    return c.json(response);
  });
}

export default createDomain;
