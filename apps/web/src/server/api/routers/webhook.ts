import { z } from "zod";
import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { WebhookCallStatus, WebhookStatus } from "@prisma/client";
import { WebhookEvents } from "@usesend/lib/src/webhook/webhook-events";
import { WebhookService } from "~/server/service/webhook-service";

const EVENT_TYPES_ENUM = z.enum(WebhookEvents);

export const webhookRouter = createTRPCRouter({
  list: teamProcedure.query(async ({ ctx }) => {
    return WebhookService.listWebhooks(ctx.team.id);
  }),

  getById: teamProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return WebhookService.getWebhook({
        id: input.id,
        teamId: ctx.team.id,
      });
    }),

  create: teamProcedure
    .input(
      z.object({
        url: z.string().url(),
        description: z.string().optional(),
        eventTypes: z.array(EVENT_TYPES_ENUM),
        secret: z.string().min(16).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return WebhookService.createWebhook({
        teamId: ctx.team.id,
        userId: ctx.session.user.id,
        url: input.url,
        description: input.description,
        eventTypes: input.eventTypes,
        secret: input.secret,
      });
    }),

  update: teamProcedure
    .input(
      z.object({
        id: z.string(),
        url: z.string().url().optional(),
        description: z.string().nullable().optional(),
        eventTypes: z.array(EVENT_TYPES_ENUM).optional(),
        rotateSecret: z.boolean().optional(),
        secret: z.string().min(16).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return WebhookService.updateWebhook({
        id: input.id,
        teamId: ctx.team.id,
        url: input.url,
        description: input.description,
        eventTypes: input.eventTypes,
        rotateSecret: input.rotateSecret,
        secret: input.secret,
      });
    }),

  setStatus: teamProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(WebhookStatus),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return WebhookService.setWebhookStatus({
        id: input.id,
        teamId: ctx.team.id,
        status: input.status,
      });
    }),

  delete: teamProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return WebhookService.deleteWebhook({
        id: input.id,
        teamId: ctx.team.id,
      });
    }),

  test: teamProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return WebhookService.testWebhook({
        webhookId: input.id,
        teamId: ctx.team.id,
      });
    }),

  listCalls: teamProcedure
    .input(
      z.object({
        webhookId: z.string().optional(),
        status: z.nativeEnum(WebhookCallStatus).optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return WebhookService.listWebhookCalls({
        teamId: ctx.team.id,
        webhookId: input.webhookId,
        status: input.status,
        limit: input.limit,
        cursor: input.cursor,
      });
    }),

  getCall: teamProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return WebhookService.getWebhookCall({
        id: input.id,
        teamId: ctx.team.id,
      });
    }),

  retryCall: teamProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return WebhookService.retryCall({
        callId: input.id,
        teamId: ctx.team.id,
      });
    }),
});
