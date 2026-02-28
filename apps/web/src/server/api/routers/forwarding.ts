import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, domainProcedure, teamProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { env } from "~/env";
import {
  createReceiptRule,
  deleteReceiptRule,
  isReceivingRegion,
} from "~/server/aws/ses-receipt-rules";

export const forwardingRouter = createTRPCRouter({
  listRules: domainProcedure.query(async ({ input, ctx }) => {
    return db.emailForwardingRule.findMany({
      where: { domainId: input.id, teamId: ctx.team.id },
      orderBy: { createdAt: "desc" },
    });
  }),

  createRule: domainProcedure
    .input(
      z.object({
        sourceAddress: z
          .string()
          .min(1, "Source address is required")
          .regex(
            /^[a-zA-Z0-9._%+-]+$/,
            "Invalid local part format"
          )
          .transform((v) => v.toLowerCase()),
        destinationAddress: z
          .string()
          .email("Invalid destination email address"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const domain = ctx.domain;

      if (domain.status !== "SUCCESS") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Domain must be verified before adding forwarding rules",
        });
      }

      if (!domain.inboundEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Inbound email receiving must be enabled before adding rules",
        });
      }

      const existing = await db.emailForwardingRule.findUnique({
        where: {
          domainId_sourceAddress: {
            domainId: input.id,
            sourceAddress: input.sourceAddress,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A forwarding rule for ${input.sourceAddress}@${domain.name} already exists`,
        });
      }

      return db.emailForwardingRule.create({
        data: {
          teamId: ctx.team.id,
          domainId: input.id,
          sourceAddress: input.sourceAddress,
          destinationAddress: input.destinationAddress,
        },
      });
    }),

  updateRule: teamProcedure
    .input(
      z.object({
        ruleId: z.string(),
        destinationAddress: z.string().email().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const rule = await db.emailForwardingRule.findFirst({
        where: { id: input.ruleId, teamId: ctx.team.id },
      });

      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Forwarding rule not found",
        });
      }

      return db.emailForwardingRule.update({
        where: { id: input.ruleId },
        data: {
          ...(input.destinationAddress !== undefined && {
            destinationAddress: input.destinationAddress,
          }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
        },
      });
    }),

  deleteRule: teamProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rule = await db.emailForwardingRule.findFirst({
        where: { id: input.ruleId, teamId: ctx.team.id },
      });

      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Forwarding rule not found",
        });
      }

      await db.emailForwardingRule.delete({
        where: { id: input.ruleId },
      });

      return { success: true };
    }),

  enableInbound: domainProcedure.mutation(async ({ input, ctx }) => {
    const domain = ctx.domain;

    if (domain.status !== "SUCCESS") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Domain must be verified before enabling inbound",
      });
    }

    if (!isReceivingRegion(domain.region)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Inbound email receiving is not available in ${domain.region}. Use a domain in us-east-1, us-west-2, or eu-west-1.`,
      });
    }

    if (domain.inboundEnabled) {
      return domain;
    }

    const ruleSetName = env.INBOUND_SES_RULE_SET;
    const snsTopicArn = env.INBOUND_SNS_TOPIC_ARN;
    const s3Bucket = env.INBOUND_S3_BUCKET;

    if (!ruleSetName || !snsTopicArn || !s3Bucket) {
      throw new TRPCError({
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

    return db.domain.update({
      where: { id: input.id },
      data: {
        inboundEnabled: true,
        sesReceiptRuleId: ruleName,
      },
    });
  }),

  disableInbound: domainProcedure.mutation(async ({ input, ctx }) => {
    const domain = ctx.domain;

    if (!domain.inboundEnabled) {
      return domain;
    }

    const ruleSetName = env.INBOUND_SES_RULE_SET;

    if (ruleSetName && domain.sesReceiptRuleId) {
      await deleteReceiptRule(domain.name, domain.region, ruleSetName);
    }

    return db.domain.update({
      where: { id: input.id },
      data: {
        inboundEnabled: false,
        sesReceiptRuleId: null,
      },
    });
  }),

  listInboundEmails: domainProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const items = await db.inboundEmail.findMany({
        where: { domainId: input.id, teamId: ctx.team.id },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1,
        }),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      return { items, nextCursor };
    }),
});
