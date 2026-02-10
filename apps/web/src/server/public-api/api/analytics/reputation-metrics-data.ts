import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { reputationMetricsData as reputationMetricsDataService } from "~/server/service/dashboard-service";

const route = createRoute({
  method: "get",
  path: "/v1/analytics/reputation-metrics",
  request: {
    query: z.object({
      domainId: z.string().optional().openapi({
        description: "Filter by domain ID",
      }),
    }),
  },
  responses: {
    200: {
      description: "Retrieve reputation metrics data",
      content: {
        "application/json": {
          schema: z.object({
            delivered: z.number().int(),
            hardBounced: z.number().int(),
            complained: z.number().int(),
            bounceRate: z.number(),
            complaintRate: z.number(),
          }),
        },
      },
    },
  },
});

function reputationMetricsData(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const domainIdParam = c.req.query("domainId");

    const domain =
      team.apiKey.domainId ??
      (domainIdParam ? Number(domainIdParam) : undefined);

    const data = await reputationMetricsDataService({ domain, team });

    return c.json(data);
  });
}

export default reputationMetricsData;
