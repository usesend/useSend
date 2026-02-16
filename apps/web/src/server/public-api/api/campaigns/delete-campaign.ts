import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { deleteCampaign, getCampaignForTeam } from "~/server/service/campaign-service";
import { campaignResponseSchema } from "~/server/public-api/schemas/campaign-schema";

const route = createRoute({
  method: "delete",
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
      description: "Delete campaign",
      content: {
        "application/json": {
          schema: campaignResponseSchema,
        },
      },
    },
  },
});

function deleteCampaignHandle(app: PublicAPIApp) {
	app.openapi(route, async (c) => {
	  const team = c.var.team;
    const campaignId = c.req.param("campaignId");

	  await getCampaignForTeam({
	    campaignId,
	    teamId: team.id,
	  });

    const campaign = await deleteCampaign(campaignId);
    return c.json(campaign);
  });
}

export default deleteCampaignHandle;
