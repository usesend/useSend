import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  getCampaignForTeam,
  resumeCampaign as resumeCampaignService,
} from "~/server/service/campaign-service";
import { campaignResponseSchema } from "~/server/public-api/schemas/campaign-schema";

const route = createRoute({
  method: "post",
  path: "/v1/campaigns/{campaignId}/resume",
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
      description: "Resume a campaign",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
  },
});

function resumeCampaign(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const campaignId = c.req.param("campaignId");

    await resumeCampaignService({
      campaignId,
      teamId: team.id,
    });

    await getCampaignForTeam({
      campaignId,
      teamId: team.id,
    });

    return c.json({ success: true });
  });
}

export default resumeCampaign;
