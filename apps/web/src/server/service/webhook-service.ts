import { WebhookEventType, WebhookDeliveryStatus, EmailStatus } from "@prisma/client";
import { db } from "../db";
import { getRedis } from "../redis";
import { Queue, Worker } from "bullmq";
import {
  DEFAULT_QUEUE_OPTIONS,
  WEBHOOK_DELIVERY_QUEUE,
} from "../queue/queue-constants";
import { logger } from "../logger/log";
import { createHmac, randomBytes } from "crypto";

const MAX_RETRY_ATTEMPTS = 3;
const WEBHOOK_TIMEOUT_MS = 10000;

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: {
    emailId: string;
    to: string[];
    from: string;
    subject: string;
    status: string;
    eventData?: Record<string, unknown>;
  };
}

interface WebhookDeliveryJob {
  webhookId: string;
  deliveryId: string;
  url: string;
  secret: string;
  payload: WebhookPayload;
}

// Map EmailStatus to WebhookEventType
function mapEmailStatusToWebhookEvent(status: EmailStatus): WebhookEventType | null {
  const mapping: Partial<Record<EmailStatus, WebhookEventType>> = {
    SENT: WebhookEventType.SENT,
    DELIVERED: WebhookEventType.DELIVERED,
    BOUNCED: WebhookEventType.BOUNCED,
    COMPLAINED: WebhookEventType.COMPLAINED,
    OPENED: WebhookEventType.OPENED,
    CLICKED: WebhookEventType.CLICKED,
    FAILED: WebhookEventType.FAILED,
  };
  return mapping[status] ?? null;
}

// Generate a secure webhook secret
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

// Sign a webhook payload using HMAC-SHA256
export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export class WebhookService {
  private static webhookQueue = new Queue<WebhookDeliveryJob>(WEBHOOK_DELIVERY_QUEUE, {
    connection: getRedis(),
  });

  private static worker = new Worker<WebhookDeliveryJob>(
    WEBHOOK_DELIVERY_QUEUE,
    async (job) => {
      await this.deliverWebhook(job.data);
    },
    {
      connection: getRedis(),
      concurrency: 10,
    }
  );

  /**
   * Dispatch webhooks for an email event
   */
  static async dispatchForEmailEvent(
    teamId: number,
    emailId: string,
    status: EmailStatus,
    eventData?: Record<string, unknown>
  ) {
    const webhookEvent = mapEmailStatusToWebhookEvent(status);
    if (!webhookEvent) {
      return; // Event type not supported for webhooks
    }

    // Get all enabled webhooks for this team that subscribe to this event
    const webhooks = await db.webhook.findMany({
      where: {
        teamId,
        enabled: true,
        events: {
          has: webhookEvent,
        },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    // Get the email data
    const email = await db.email.findUnique({
      where: { id: emailId },
      select: {
        id: true,
        to: true,
        from: true,
        subject: true,
        latestStatus: true,
      },
    });

    if (!email) {
      logger.error({ emailId }, "Email not found for webhook dispatch");
      return;
    }

    const payload: WebhookPayload = {
      event: webhookEvent,
      timestamp: new Date().toISOString(),
      data: {
        emailId: email.id,
        to: email.to,
        from: email.from,
        subject: email.subject,
        status: email.latestStatus,
        eventData,
      },
    };

    // Create delivery records and queue jobs for each webhook
    await Promise.all(
      webhooks.map(async (webhook) => {
        const delivery = await db.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            emailId,
            eventType: webhookEvent,
            payload: payload as any,
            status: WebhookDeliveryStatus.PENDING,
          },
        });

        await this.webhookQueue.add(
          delivery.id,
          {
            webhookId: webhook.id,
            deliveryId: delivery.id,
            url: webhook.url,
            secret: webhook.secret,
            payload,
          },
          {
            ...DEFAULT_QUEUE_OPTIONS,
            attempts: MAX_RETRY_ATTEMPTS,
            backoff: {
              type: "exponential",
              delay: 5000, // Start with 5 seconds, then 10, 20...
            },
          }
        );
      })
    );
  }

  /**
   * Deliver a webhook
   */
  private static async deliverWebhook(job: WebhookDeliveryJob) {
    const { deliveryId, url, secret, payload } = job;

    const payloadString = JSON.stringify(payload);
    const signature = signWebhookPayload(payloadString, secret);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": payload.timestamp,
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text().catch(() => "");

      // Update delivery record
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: response.ok
            ? WebhookDeliveryStatus.SUCCESS
            : WebhookDeliveryStatus.FAILED,
          statusCode: response.status,
          response: responseText.substring(0, 1000), // Limit response size
          attempts: { increment: 1 },
          lastAttempt: new Date(),
        },
      });

      if (!response.ok) {
        logger.warn(
          { deliveryId, statusCode: response.status, url },
          "Webhook delivery failed with non-2xx status"
        );
        throw new Error(`Webhook returned status ${response.status}`);
      }

      logger.info({ deliveryId, url }, "Webhook delivered successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Update delivery record with failure
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          response: errorMessage.substring(0, 1000),
          attempts: { increment: 1 },
          lastAttempt: new Date(),
        },
      });

      logger.error({ deliveryId, url, error: errorMessage }, "Webhook delivery error");
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Test a webhook by sending a test payload
   */
  static async testWebhook(webhookId: string, teamId: number) {
    const webhook = await db.webhook.findUnique({
      where: { id: webhookId, teamId },
    });

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    const testPayload: WebhookPayload = {
      event: WebhookEventType.DELIVERED,
      timestamp: new Date().toISOString(),
      data: {
        emailId: "test-email-id",
        to: ["test@example.com"],
        from: "sender@example.com",
        subject: "Test Email",
        status: "DELIVERED",
        eventData: { test: true },
      },
    };

    const payloadString = JSON.stringify(testPayload);
    const signature = signWebhookPayload(payloadString, webhook.secret);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": testPayload.timestamp,
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return {
        success: response.ok,
        statusCode: response.status,
        response: await response.text().catch(() => ""),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        success: false,
        statusCode: 0,
        response: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }
}
