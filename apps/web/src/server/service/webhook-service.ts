import { WebhookCallStatus, WebhookStatus } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { createHmac, randomUUID, randomBytes } from "crypto";
import {
  WebhookEventData,
  WebhookPayloadData,
  WEBHOOK_EVENT_VERSION,
  type WebhookEvent,
  type WebhookEventPayloadMap,
  type WebhookEventType,
} from "@usesend/lib/src/webhook/webhook-events";
import { db } from "../db";
import { getRedis } from "../redis";
import {
  DEFAULT_QUEUE_OPTIONS,
  WEBHOOK_DISPATCH_QUEUE,
} from "../queue/queue-constants";
import { createWorkerHandler, TeamJob } from "../queue/bullmq-context";
import { logger } from "../logger/log";
import { LimitService } from "./limit-service";
import { UnsendApiError } from "../public-api/api-error";

const WEBHOOK_DISPATCH_CONCURRENCY = 25;
const WEBHOOK_MAX_ATTEMPTS = 6;
const WEBHOOK_BASE_BACKOFF_MS = 5_000;
const WEBHOOK_LOCK_TTL_MS = 15_000;
const WEBHOOK_LOCK_RETRY_DELAY_MS = 2_000;
const WEBHOOK_AUTO_DISABLE_THRESHOLD = 30;
const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000;
const WEBHOOK_RESPONSE_TEXT_LIMIT = 4_096;

type WebhookCallJobData = {
  callId: string;
  teamId?: number;
};

type WebhookCallJob = TeamJob<WebhookCallJobData>;

type WebhookEventInput<TType extends WebhookEventType> =
  WebhookPayloadData<TType>;

export class WebhookQueueService {
  private static queue = new Queue<WebhookCallJobData>(WEBHOOK_DISPATCH_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      ...DEFAULT_QUEUE_OPTIONS,
      attempts: WEBHOOK_MAX_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: WEBHOOK_BASE_BACKOFF_MS,
      },
    },
  });

  private static worker = new Worker(
    WEBHOOK_DISPATCH_QUEUE,
    createWorkerHandler(processWebhookCall),
    {
      connection: getRedis(),
      concurrency: WEBHOOK_DISPATCH_CONCURRENCY,
    },
  );

  static {
    this.worker.on("error", (error) => {
      logger.error({ error }, "[WebhookQueueService]: Worker error");
    });

    logger.info("[WebhookQueueService]: Initialized webhook queue service");
  }

  public static async enqueueCall(callId: string, teamId: number) {
    await this.queue.add(
      callId,
      {
        callId,
        teamId,
      },
      { jobId: callId },
    );
  }
}

export class WebhookService {
  public static async emit<TType extends WebhookEventType>(
    teamId: number,
    type: TType,
    payload: WebhookEventInput<TType>,
  ) {
    const activeWebhooks = await db.webhook.findMany({
      where: {
        teamId,
        status: WebhookStatus.ACTIVE,
        OR: [
          {
            eventTypes: {
              has: type,
            },
          },
          {
            eventTypes: {
              isEmpty: true,
            },
          },
        ],
      },
    });

    if (activeWebhooks.length === 0) {
      logger.debug(
        { teamId, type },
        "[WebhookService]: No active webhooks for event type",
      );
      return;
    }

    const payloadString = stringifyPayload(payload);

    for (const webhook of activeWebhooks) {
      const call = await db.webhookCall.create({
        data: {
          webhookId: webhook.id,
          teamId: webhook.teamId,
          type: type,
          payload: payloadString,
          status: WebhookCallStatus.PENDING,
          attempt: 0,
        },
      });

      await WebhookQueueService.enqueueCall(call.id, webhook.teamId);
    }
  }

  public static async retryCall(params: { callId: string; teamId: number }) {
    const call = await db.webhookCall.findFirst({
      where: { id: params.callId, teamId: params.teamId },
    });

    if (!call) {
      throw new Error("Webhook call not found");
    }

    await db.webhookCall.update({
      where: { id: call.id },
      data: {
        status: WebhookCallStatus.PENDING,
        attempt: 0,
        nextAttemptAt: null,
        lastError: null,
        responseStatus: null,
        responseTimeMs: null,
        responseText: null,
      },
    });

    await WebhookQueueService.enqueueCall(call.id, params.teamId);

    return call.id;
  }

  public static async testWebhook(params: {
    webhookId: string;
    teamId: number;
  }) {
    const webhook = await db.webhook.findFirst({
      where: { id: params.webhookId, teamId: params.teamId },
    });

    if (!webhook) {
      throw new Error("Webhook not found");
    }

    const payload = {
      test: true,
      webhookId: webhook.id,
      sentAt: new Date().toISOString(),
    };

    const call = await db.webhookCall.create({
      data: {
        webhookId: webhook.id,
        teamId: webhook.teamId,
        type: "webhook.test",
        payload: stringifyPayload(payload),
        status: WebhookCallStatus.PENDING,
        attempt: 0,
      },
    });

    await WebhookQueueService.enqueueCall(call.id, webhook.teamId);

    return call.id;
  }

  public static generateSecret() {
    return `whsec_${randomBytes(32).toString("hex")}`;
  }

  public static async listWebhooks(teamId: number) {
    return db.webhook.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
    });
  }

  public static async getWebhook(params: { id: string; teamId: number }) {
    const webhook = await db.webhook.findFirst({
      where: { id: params.id, teamId: params.teamId },
    });

    if (!webhook) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    return webhook;
  }

  public static async createWebhook(params: {
    teamId: number;
    userId: number;
    url: string;
    description?: string;
    eventTypes: string[];
    secret?: string;
  }) {
    const { isLimitReached, reason } = await LimitService.checkWebhookLimit(
      params.teamId,
    );

    if (isLimitReached) {
      throw new UnsendApiError({
        code: "FORBIDDEN",
        message: reason ?? "Webhook limit reached",
      });
    }

    const secret = params.secret ?? WebhookService.generateSecret();

    return db.webhook.create({
      data: {
        teamId: params.teamId,
        url: params.url,
        description: params.description,
        secret,
        eventTypes: params.eventTypes,
        status: WebhookStatus.ACTIVE,
        createdByUserId: params.userId,
      },
    });
  }

  public static async updateWebhook(params: {
    id: string;
    teamId: number;
    url?: string;
    description?: string | null;
    eventTypes?: string[];
    rotateSecret?: boolean;
    secret?: string;
  }) {
    const webhook = await db.webhook.findFirst({
      where: { id: params.id, teamId: params.teamId },
    });

    if (!webhook) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    const secret =
      params.rotateSecret === true
        ? WebhookService.generateSecret()
        : params.secret;

    return db.webhook.update({
      where: { id: webhook.id },
      data: {
        url: params.url ?? webhook.url,
        description:
          params.description === undefined
            ? webhook.description
            : (params.description ?? null),
        eventTypes: params.eventTypes ?? webhook.eventTypes,
        secret: secret ?? webhook.secret,
      },
    });
  }

  public static async setWebhookStatus(params: {
    id: string;
    teamId: number;
    status: WebhookStatus;
  }) {
    const webhook = await db.webhook.findFirst({
      where: { id: params.id, teamId: params.teamId },
    });

    if (!webhook) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    return db.webhook.update({
      where: { id: webhook.id },
      data: {
        status: params.status,
        consecutiveFailures:
          params.status === WebhookStatus.ACTIVE
            ? 0
            : webhook.consecutiveFailures,
      },
    });
  }

  public static async deleteWebhook(params: { id: string; teamId: number }) {
    const webhook = await db.webhook.findFirst({
      where: { id: params.id, teamId: params.teamId },
    });

    if (!webhook) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    return db.webhook.delete({
      where: { id: webhook.id },
    });
  }

  public static async listWebhookCalls(params: {
    teamId: number;
    webhookId?: string;
    status?: WebhookCallStatus;
    limit: number;
    cursor?: string;
  }) {
    const calls = await db.webhookCall.findMany({
      where: {
        teamId: params.teamId,
        webhookId: params.webhookId,
        status: params.status,
      },
      orderBy: { createdAt: "desc" },
      take: params.limit + 1,
      cursor: params.cursor ? { id: params.cursor } : undefined,
    });

    let nextCursor: string | null = null;
    if (calls.length > params.limit) {
      const next = calls.pop();
      nextCursor = next?.id ?? null;
    }

    return {
      items: calls,
      nextCursor,
    };
  }

  public static async getWebhookCall(params: { id: string; teamId: number }) {
    const call = await db.webhookCall.findFirst({
      where: { id: params.id, teamId: params.teamId },
      include: {
        webhook: {
          select: {
            apiVersion: true,
          },
        },
      },
    });

    if (!call) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Webhook call not found",
      });
    }

    return call;
  }
}

function stringifyPayload(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload);
  } catch (error) {
    logger.error(
      { error },
      "[WebhookService]: Failed to stringify payload, falling back to empty object",
    );
    return "{}";
  }
}

async function processWebhookCall(job: WebhookCallJob) {
  const attempt = job.attemptsMade + 1;
  const call = await db.webhookCall.findUnique({
    where: { id: job.data.callId },
    include: {
      webhook: true,
    },
  });

  if (!call) {
    logger.warn(
      { callId: job.data.callId },
      "[WebhookQueueService]: Call not found",
    );
    return;
  }

  if (call.webhook.status !== WebhookStatus.ACTIVE) {
    await db.webhookCall.update({
      where: { id: call.id },
      data: {
        status: WebhookCallStatus.DISCARDED,
        attempt,
      },
    });
    logger.info(
      { callId: call.id, webhookId: call.webhookId },
      "[WebhookQueueService]: Discarded call because webhook is not active",
    );
    return;
  }

  await db.webhookCall.update({
    where: { id: call.id },
    data: {
      status: WebhookCallStatus.IN_PROGRESS,
      attempt,
    },
  });

  const lockKey = `webhook:lock:${call.webhookId}`;
  const redis = getRedis();
  const lockValue = randomUUID();

  const lockAcquired = await acquireLock(redis, lockKey, lockValue);
  if (!lockAcquired) {
    await db.webhookCall.update({
      where: { id: call.id },
      data: {
        nextAttemptAt: new Date(Date.now() + WEBHOOK_LOCK_RETRY_DELAY_MS),
        status: WebhookCallStatus.PENDING,
      },
    });
    // Let BullMQ handle retry timing; this records observability.
    throw new Error("Webhook lock not acquired");
  }

  try {
    const body = buildPayload(call, attempt);
    const { responseStatus, responseTimeMs, responseText } = await postWebhook({
      url: call.webhook.url,
      secret: call.webhook.secret,
      type: call.type,
      callId: call.id,
      body,
    });

    logger.info(
      `Webhook call ${call.id} completed successfully, response status: ${responseStatus}, response time: ${responseTimeMs}ms, `,
    );

    await db.$transaction([
      db.webhookCall.update({
        where: { id: call.id },
        data: {
          status: WebhookCallStatus.DELIVERED,
          attempt,
          responseStatus,
          responseTimeMs,
          lastError: null,
          nextAttemptAt: null,
          responseText,
        },
      }),
      db.webhook.update({
        where: { id: call.webhookId },
        data: {
          consecutiveFailures: 0,
          lastSuccessAt: new Date(),
        },
      }),
    ]);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook error";
    const responseStatus =
      error instanceof WebhookHttpError ? error.statusCode : null;
    const responseTimeMs =
      error instanceof WebhookHttpError ? error.responseTimeMs : null;
    const responseText =
      error instanceof WebhookHttpError ? error.responseText : null;

    const nextAttemptAt =
      attempt < WEBHOOK_MAX_ATTEMPTS
        ? new Date(Date.now() + computeBackoff(attempt))
        : null;

    const updatedWebhook = await db.webhook.update({
      where: { id: call.webhookId },
      data: {
        consecutiveFailures: {
          increment: 1,
        },
        lastFailureAt: new Date(),
        status:
          call.webhook.consecutiveFailures + 1 >= WEBHOOK_AUTO_DISABLE_THRESHOLD
            ? WebhookStatus.AUTO_DISABLED
            : call.webhook.status,
      },
    });

    await db.webhookCall.update({
      where: { id: call.id },
      data: {
        status:
          attempt >= WEBHOOK_MAX_ATTEMPTS
            ? WebhookCallStatus.FAILED
            : WebhookCallStatus.PENDING,
        attempt,
        nextAttemptAt,
        lastError: errorMessage,
        responseStatus: responseStatus ?? undefined,
        responseTimeMs: responseTimeMs ?? undefined,
        responseText: responseText ?? undefined,
      },
    });

    const statusLabel =
      updatedWebhook.status === WebhookStatus.AUTO_DISABLED
        ? "auto-disabled"
        : "failed";

    logger.warn(
      {
        callId: call.id,
        webhookId: call.webhookId,
        statusLabel,
        attempt,
        responseStatus,
        nextAttemptAt,
        error: errorMessage,
      },
      "[WebhookQueueService]: Webhook call failure",
    );

    if (updatedWebhook.status === WebhookStatus.AUTO_DISABLED) {
      return;
    }

    throw error;
  } finally {
    await releaseLock(redis, lockKey, lockValue);
  }
}

async function acquireLock(
  redis: ReturnType<typeof getRedis>,
  key: string,
  value: string,
) {
  const result = await redis.set(key, value, "PX", WEBHOOK_LOCK_TTL_MS, "NX");
  return result === "OK";
}

async function releaseLock(
  redis: ReturnType<typeof getRedis>,
  key: string,
  value: string,
) {
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await redis.eval(script, 1, key, value);
  } catch (error) {
    logger.error({ error }, "[WebhookQueueService]: Failed to release lock");
  }
}

function computeBackoff(attempt: number) {
  const base = WEBHOOK_BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = base * 0.3 * Math.random();
  return base + jitter;
}

type WebhookPayload = {
  id: string;
  type: string;
  version: string | null;
  createdAt: string;
  teamId: number;
  data: unknown;
  attempt: number;
};

function buildPayload(
  call: {
    id: string;
    webhookId: string;
    teamId: number;
    type: string;
    payload: string;
    createdAt: Date;
    webhook: { apiVersion: string | null };
  },
  attempt: number,
): WebhookPayload {
  let parsed: unknown = call.payload;
  try {
    parsed = JSON.parse(call.payload);
  } catch {
    // keep string payload as-is
  }

  return {
    id: call.id,
    type: call.type,
    version: call.webhook.apiVersion ?? WEBHOOK_EVENT_VERSION,
    createdAt: call.createdAt.toISOString(),
    teamId: call.teamId,
    data: parsed,
    attempt,
  };
}

class WebhookHttpError extends Error {
  public statusCode: number | null;
  public responseTimeMs: number | null;
  public responseText: string | null;

  constructor(
    message: string,
    statusCode: number | null,
    responseTimeMs: number | null,
    responseText: string | null,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.responseTimeMs = responseTimeMs;
    this.responseText = responseText;
  }
}

async function postWebhook(params: {
  url: string;
  secret: string;
  type: string;
  callId: string;
  body: WebhookPayload;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WEBHOOK_REQUEST_TIMEOUT_MS,
  );

  const stringBody = JSON.stringify(params.body);
  const timestamp = Date.now().toString();
  const signature = signBody(params.secret, timestamp, stringBody);

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "UseSend-Webhook/1.0",
    "X-UseSend-Event": params.type,
    "X-UseSend-Call": params.callId,
    "X-UseSend-Timestamp": timestamp,
    "X-UseSend-Signature": signature,
    "X-UseSend-Retry": params.body.attempt > 1 ? "true" : "false",
  };

  const start = Date.now();

  try {
    const response = await fetch(params.url, {
      method: "POST",
      headers,
      body: stringBody,
      redirect: "manual",
      signal: controller.signal,
    });

    const responseTimeMs = Date.now() - start;
    const responseText = await captureResponseText(response);
    if (response.ok) {
      return {
        responseStatus: response.status,
        responseTimeMs,
        responseText,
      };
    }

    throw new WebhookHttpError(
      `Non-2xx response: ${response.status}`,
      response.status,
      responseTimeMs,
      responseText,
    );
  } catch (error) {
    const responseTimeMs = Date.now() - start;
    if (error instanceof WebhookHttpError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new WebhookHttpError(
        "Webhook request timed out",
        null,
        responseTimeMs,
        null,
      );
    }
    throw new WebhookHttpError(
      error instanceof Error ? error.message : "Unknown fetch error",
      null,
      responseTimeMs,
      null,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function signBody(secret: string, timestamp: string, body: string) {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${body}`);
  return `v1=${hmac.digest("hex")}`;
}

async function captureResponseText(response: Response) {
  const contentType = response.headers.get("content-type");
  const isText =
    contentType?.startsWith("text/") ||
    contentType?.includes("application/json") ||
    contentType?.includes("application/xml");

  if (!isText) {
    return null;
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : null;

  if (contentLength && Number.isFinite(contentLength)) {
    if (contentLength <= 0) {
      return "";
    }
    if (contentLength > WEBHOOK_RESPONSE_TEXT_LIMIT * 2) {
      return `<omitted: content-length ${contentLength} exceeds limit ${WEBHOOK_RESPONSE_TEXT_LIMIT}>`;
    }
  }

  const body = response.body;

  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let chunks = "";
    let truncated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        const decoded = decoder.decode(value, { stream: true });
        received += decoded.length;
        if (received > WEBHOOK_RESPONSE_TEXT_LIMIT) {
          const sliceRemaining =
            WEBHOOK_RESPONSE_TEXT_LIMIT - (received - decoded.length);
          chunks += decoded.slice(0, Math.max(0, sliceRemaining));
          truncated = true;
          await reader.cancel();
          break;
        } else {
          chunks += decoded;
        }
      }
    }

    if (truncated) {
      return `${chunks}...<truncated>`;
    }

    return chunks;
  }

  const text = await response.text();
  if (text.length > WEBHOOK_RESPONSE_TEXT_LIMIT) {
    return `${text.slice(0, WEBHOOK_RESPONSE_TEXT_LIMIT)}...<truncated>`;
  }

  return text;
}
