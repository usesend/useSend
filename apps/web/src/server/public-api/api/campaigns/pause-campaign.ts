import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  pauseCampaign,
} from "~/server/service/campaign-service";

const route = createRoute({
  method: "post",
  path: "/v1/campaigns/{campaignId}/pause",
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
      description: "Pause a campaign",
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

function pauseCampaignHandle(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const campaignId = c.req.param("campaignId");

    await pauseCampaign({
      campaignId,
      teamId: team.id,
    });

    return c.json({ success: true });
  });
}

export default pauseCampaignHandle;
