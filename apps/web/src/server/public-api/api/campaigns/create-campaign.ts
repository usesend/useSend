import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  campaignCreateSchema,
  CampaignCreateInput,
  campaignResponseSchema,
} from "~/server/public-api/schemas/campaign-schema";
import {
  createCampaignFromApi,
  getCampaignForTeam,
  scheduleCampaign,
} from "~/server/service/campaign-service";
const route = createRoute({
  method: "post",
  path: "/v1/campaigns",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: campaignCreateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Create a campaign",
      content: {
        "application/json": {
          schema: campaignResponseSchema,
        },
      },
    },
  },
});

function createCampaign(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const body: CampaignCreateInput = c.req.valid("json");

    const campaign = await createCampaignFromApi({
      teamId: team.id,
      apiKeyId: team.apiKeyId,
      name: body.name,
      from: body.from,
      subject: body.subject,
      previewText: body.previewText,
      content: body.content,
      html: body.html,
      contactBookId: body.contactBookId,
      replyTo: body.replyTo,
      cc: body.cc,
      bcc: body.bcc,
      batchSize: body.batchSize,
    });

    if (body.sendNow || body.scheduledAt) {
      const scheduledAtInput = body.sendNow ? new Date() : body.scheduledAt;

      await scheduleCampaign({
        campaignId: campaign.id,
        teamId: team.id,
        scheduledAt: scheduledAtInput,
        batchSize: body.batchSize,
      });
    }

    const latestCampaign = await getCampaignForTeam({
      campaignId: campaign.id,
      teamId: team.id,
    });

    return c.json(latestCampaign);
  });
}

export default createCampaign;
