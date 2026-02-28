import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import { db } from "~/server/db";
import { env } from "~/env";
import {
  createReceiptRule,
  deleteReceiptRule,
  isReceivingRegion,
} from "~/server/aws/ses-receipt-rules";

const route = createRoute({
  method: "put",
  path: "/v1/domains/{id}/inbound",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: { name: "id", in: "path" },
        example: 1,
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            enabled: z.boolean(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            inboundEnabled: z.boolean(),
          }),
        },
      },
      description: "Enable or disable inbound email receiving",
    },
  },
});

function updateDomainInbound(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const domainId = c.req.valid("param").id;
    const { enabled } = c.req.valid("json");

    const domain = await db.domain.findUnique({
      where: { id: domainId, teamId: team.id },
    });

    if (!domain) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    if (enabled && !domain.inboundEnabled) {
      if (domain.status !== "SUCCESS") {
        throw new UnsendApiError({
          code: "BAD_REQUEST",
          message: "Domain must be verified before enabling inbound",
        });
      }

      if (!isReceivingRegion(domain.region)) {
        throw new UnsendApiError({
          code: "BAD_REQUEST",
          message: `Inbound email receiving is not available in ${domain.region}. Use a domain in us-east-1, us-west-2, or eu-west-1.`,
        });
      }

      const ruleSetName = env.INBOUND_SES_RULE_SET;
      const snsTopicArn = env.INBOUND_SNS_TOPIC_ARN;
      const s3Bucket = env.INBOUND_S3_BUCKET;

      if (!ruleSetName || !snsTopicArn || !s3Bucket) {
        throw new UnsendApiError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Inbound email infrastructure is not configured",
        });
      }

      const ruleName = await createReceiptRule(
        domain.name,
        domain.region,
        ruleSetName,
        snsTopicArn,
        s3Bucket
      );

      await db.domain.update({
        where: { id: domainId },
        data: { inboundEnabled: true, sesReceiptRuleId: ruleName },
      });

      return c.json({ inboundEnabled: true });
    }

    if (!enabled && domain.inboundEnabled) {
      const ruleSetName = env.INBOUND_SES_RULE_SET;

      if (ruleSetName && domain.sesReceiptRuleId) {
        await deleteReceiptRule(domain.name, domain.region, ruleSetName);
      }

      await db.domain.update({
        where: { id: domainId },
        data: { inboundEnabled: false, sesReceiptRuleId: null },
      });

      return c.json({ inboundEnabled: false });
    }

    return c.json({ inboundEnabled: domain.inboundEnabled });
  });
}

export default updateDomainInbound;
