import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { emailTimeSeries as emailTimeSeriesService } from "~/server/service/dashboard-service";

const route = createRoute({
  method: "get",
  path: "/v1/analytics/email-time-series",
  request: {
    query: z.object({
      days: z.enum(["7", "30"]).optional().openapi({
        description: "Number of days to retrieve data for (default: 30)",
        example: "30",
      }),
      domainId: z.string().optional().openapi({
        description: "Filter by domain ID",
      }),
    }),
  },
  responses: {
    200: {
      description: "Retrieve email time series data",
      content: {
        "application/json": {
          schema: z.object({
            result: z.array(
              z.object({
                date: z.string(),
                sent: z.number().int(),
                delivered: z.number().int(),
                opened: z.number().int(),
                clicked: z.number().int(),
                bounced: z.number().int(),
                complained: z.number().int(),
              })
            ),
            totalCounts: z.object({
              sent: z.number().int(),
              delivered: z.number().int(),
              opened: z.number().int(),
              clicked: z.number().int(),
              bounced: z.number().int(),
              complained: z.number().int(),
            }),
          }),
        },
      },
    },
  },
});

function emailTimeSeries(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const daysParam = c.req.query("days");
    const domainIdParam = c.req.query("domainId");

    const days = daysParam ? Number(daysParam) : undefined;
    const domain =
      team.apiKey.domainId ??
      (domainIdParam ? Number(domainIdParam) : undefined);

    const data = await emailTimeSeriesService({ days, domain, team });

    return c.json(data);
  });
}

export default emailTimeSeries;
