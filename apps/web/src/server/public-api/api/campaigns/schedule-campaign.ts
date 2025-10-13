import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  campaignScheduleSchema,
  CampaignScheduleInput,
  campaignResponseSchema,
} from "~/server/public-api/schemas/campaign-schema";
import {
  getCampaignForTeam,
  scheduleCampaign as scheduleCampaignService,
} from "~/server/service/campaign-service";
const route = createRoute({
  method: "post",
  path: "/v1/campaigns/{campaignId}/schedule",
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
    body: {
      required: true,
      content: {
        "application/json": {
          schema: campaignScheduleSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Schedule a campaign",
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

function scheduleCampaign(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const campaignId = c.req.param("campaignId");
    const body: CampaignScheduleInput = c.req.valid("json");

    await scheduleCampaignService({
      campaignId,
      teamId: team.id,
      scheduledAt: body.scheduledAt,
      batchSize: body.batchSize,
    });

    await getCampaignForTeam({
      campaignId,
      teamId: team.id,
    });

    return c.json({ success: true });
  });
}

export default scheduleCampaign;
