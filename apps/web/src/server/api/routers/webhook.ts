import { z } from "zod";
import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { WebhookEventType } from "@prisma/client";
import { generateWebhookSecret, WebhookService } from "~/server/service/webhook-service";
import { db } from "~/server/db";
import { TRPCError } from "@trpc/server";

/**
 * Validates a webhook URL to prevent SSRF attacks.
 * Blocks internal IPs, localhost, and cloud metadata endpoints.
 */
function validateWebhookUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and loopback
    const blockedHostnames = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "[::1]",
    ];
    if (blockedHostnames.includes(hostname)) {
      return { valid: false, reason: "Localhost URLs are not allowed" };
    }

    // Block cloud metadata endpoints
    const metadataEndpoints = [
      "169.254.169.254", // AWS/GCP/Azure metadata
      "metadata.google.internal",
      "metadata.goog",
      "169.254.170.2", // AWS ECS task metadata
    ];
    if (metadataEndpoints.includes(hostname)) {
      return { valid: false, reason: "Cloud metadata endpoints are not allowed" };
    }

    // Block internal IP ranges
    const ipParts = hostname.split(".");
    if (ipParts.length === 4) {
      const [a, b] = ipParts.map(Number);
      // 10.x.x.x
      if (a === 10) {
        return { valid: false, reason: "Internal IP addresses are not allowed" };
      }
      // 172.16.x.x - 172.31.x.x
      if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
        return { valid: false, reason: "Internal IP addresses are not allowed" };
      }
      // 192.168.x.x
      if (a === 192 && b === 168) {
        return { valid: false, reason: "Internal IP addresses are not allowed" };
      }
    }

    // Must use HTTPS in production
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return { valid: false, reason: "HTTPS is required for webhook URLs" };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
}

const webhookEventTypes = z.array(
  z.enum([
    "SENT",
    "DELIVERED",
    "BOUNCED",
    "COMPLAINED",
    "OPENED",
    "CLICKED",
    "FAILED",
  ])
);

export const webhookRouter = createTRPCRouter({
  // List all webhooks for the team
  list: teamProcedure.query(async ({ ctx }) => {
    const webhooks = await db.webhook.findMany({
      where: { teamId: ctx.team.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { deliveries: true },
        },
      },
    });

    return webhooks.map((webhook) => ({
      ...webhook,
      secret: undefined, // Don't expose the full secret
      secretPreview: webhook.secret.substring(0, 8) + "...",
      deliveryCount: webhook._count.deliveries,
    }));
  }),

  // Get a single webhook with details
  get: teamProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const webhook = await db.webhook.findUnique({
        where: { id: input.id, teamId: ctx.team.id },
        include: {
          deliveries: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });

      if (!webhook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      return {
        ...webhook,
        secret: undefined,
        secretPreview: webhook.secret.substring(0, 8) + "...",
      };
    }),

  // Create a new webhook
  create: teamProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        url: z.string().url(),
        events: webhookEventTypes.min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate URL to prevent SSRF
      const urlValidation = validateWebhookUrl(input.url);
      if (!urlValidation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: urlValidation.reason || "Invalid webhook URL",
        });
      }

      const secret = generateWebhookSecret();

      const webhook = await db.webhook.create({
        data: {
          name: input.name,
          url: input.url,
          secret,
          events: input.events as WebhookEventType[],
          teamId: ctx.team.id,
        },
      });

      // Return the secret only on creation so user can save it
      return {
        ...webhook,
        secret, // Full secret returned only on creation
      };
    }),

  // Update a webhook
  update: teamProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        url: z.string().url().optional(),
        events: webhookEventTypes.min(1).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate URL if being updated
      if (input.url) {
        const urlValidation = validateWebhookUrl(input.url);
        if (!urlValidation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: urlValidation.reason || "Invalid webhook URL",
          });
        }
      }

      const webhook = await db.webhook.findUnique({
        where: { id: input.id, teamId: ctx.team.id },
      });

      if (!webhook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      const updated = await db.webhook.update({
        where: { id: input.id },
        data: {
          name: input.name,
          url: input.url,
          events: input.events as WebhookEventType[] | undefined,
          enabled: input.enabled,
        },
      });

      return {
        ...updated,
        secret: undefined,
        secretPreview: updated.secret.substring(0, 8) + "...",
      };
    }),

  // Regenerate webhook secret
  regenerateSecret: teamProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const webhook = await db.webhook.findUnique({
        where: { id: input.id, teamId: ctx.team.id },
      });

      if (!webhook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      const newSecret = generateWebhookSecret();

      await db.webhook.update({
        where: { id: input.id },
        data: { secret: newSecret },
      });

      // Return new secret only this one time
      return { secret: newSecret };
    }),

  // Delete a webhook
  delete: teamProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const webhook = await db.webhook.findUnique({
        where: { id: input.id, teamId: ctx.team.id },
      });

      if (!webhook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      await db.webhook.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Test a webhook
  test: teamProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await WebhookService.testWebhook(input.id, ctx.team.id);
      return result;
    }),

  // Get recent deliveries for a webhook
  getDeliveries: teamProcedure
    .input(
      z.object({
        webhookId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const webhook = await db.webhook.findUnique({
        where: { id: input.webhookId, teamId: ctx.team.id },
      });

      if (!webhook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      const deliveries = await db.webhookDelivery.findMany({
        where: { webhookId: input.webhookId },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      const hasMore = deliveries.length > input.limit;
      const items = hasMore ? deliveries.slice(0, -1) : deliveries;

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      };
    }),
});
