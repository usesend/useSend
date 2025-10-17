import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { getCampaignForTeam } from "~/server/service/campaign-service";
import { campaignResponseSchema } from "~/server/public-api/schemas/campaign-schema";

const route = createRoute({
  method: "get",
  path: "/v1/campaigns/{campaignId}",
  request: {
    params: z.object({
      campaignId: z
        .string()
        .min(1)
        .openapi({
          param: {
            name: "campaignId",
            in: "path",
          },
          example: "cmp_123",
        }),
    }),
  },
  responses: {
    200: {
      description: "Get campaign details",
      content: {
        "application/json": {
          schema: campaignResponseSchema,
        },
      },
    },
  },
});

function getCampaign(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const campaignId = c.req.param("campaignId");

    const campaign = await getCampaignForTeam({
      campaignId,
      teamId: team.id,
    });

    return c.json(campaign);
  });
}

export default getCampaign;
