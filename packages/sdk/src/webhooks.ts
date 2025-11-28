import { createHmac, timingSafeEqual } from "crypto";
import type {
  WebhookEvent,
  WebhookEventData,
  WebhookEventPayloadMap,
  WebhookEventType,
} from "@usesend/lib/src/webhook/webhook-events";

type RawBody = string | Buffer | ArrayBuffer | ArrayBufferView | Uint8Array;

type HeaderLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

export type WebhookVerificationErrorCode =
  | "MISSING_SIGNATURE"
  | "MISSING_TIMESTAMP"
  | "INVALID_SIGNATURE_FORMAT"
  | "INVALID_TIMESTAMP"
  | "TIMESTAMP_OUT_OF_RANGE"
  | "SIGNATURE_MISMATCH"
  | "INVALID_BODY"
  | "INVALID_JSON";

export class WebhookVerificationError extends Error {
  constructor(
    public readonly code: WebhookVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export const WEBHOOK_SIGNATURE_HEADER = "X-UseSend-Signature";
export const WEBHOOK_TIMESTAMP_HEADER = "X-UseSend-Timestamp";
export const WEBHOOK_EVENT_HEADER = "X-UseSend-Event";
export const WEBHOOK_CALL_HEADER = "X-UseSend-Call";

const SIGNATURE_PREFIX = "v1=";
const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export class Webhooks {
  constructor(private secret: string) {}

  /**
   * Verify webhook signature without parsing the event.
   *
   * @param body - Raw webhook body (string or Buffer)
   * @param options - Headers and optional configuration
   * @returns true if signature is valid, false otherwise
   *
   * @example
   * ```ts
   * const usesend = new UseSend(apiKey);
   * const webhooks = usesend.webhooks('whsec_xxx');
   *
   * const isValid = webhooks.verify(body, {
   *   headers: request.headers
   * });
   *
   * if (!isValid) {
   *   return new Response('Invalid signature', { status: 401 });
   * }
   * ```
   */
  verify(
    body: RawBody,
    options: {
      headers: HeaderLike;
      secret?: string;
      tolerance?: number;
    },
  ): boolean {
    try {
      this.verifyInternal(body, options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify and parse a webhook event.
   *
   * @param body - Raw webhook body (string or Buffer)
   * @param options - Headers and optional configuration
   * @returns Verified and typed webhook event
   *
   * @example
   * ```ts
   * const usesend = new UseSend(apiKey);
   * const webhooks = usesend.webhooks('whsec_xxx');
   *
   * // Next.js App Router
   * const event = webhooks.constructEvent(await request.text(), {
   *   headers: request.headers
   * });
   *
   * // Next.js Pages Router
   * const event = webhooks.constructEvent(req.body, {
   *   headers: req.headers
   * });
   *
   * // Express
   * const event = webhooks.constructEvent(req.body, {
   *   headers: req.headers
   * });
   *
   * // Type-safe event handling
   * if (event.type === 'email.delivered') {
   *   console.log(event.data.to);
   * }
   * ```
   */
  constructEvent(
    body: RawBody,
    options: {
      headers: HeaderLike;
      secret?: string;
      tolerance?: number;
    },
  ): WebhookEventData {
    this.verifyInternal(body, options);

    const bodyString = toUtf8String(body);
    try {
      return JSON.parse(bodyString) as WebhookEventData;
    } catch {
      throw new WebhookVerificationError(
        "INVALID_JSON",
        "Webhook payload is not valid JSON",
      );
    }
  }

  private verifyInternal(
    body: RawBody,
    options: {
      headers: HeaderLike;
      secret?: string;
      tolerance?: number;
    },
  ): void {
    const webhookSecret = options.secret ?? this.secret;
    const signature = getHeader(options.headers, WEBHOOK_SIGNATURE_HEADER);
    const timestamp = getHeader(options.headers, WEBHOOK_TIMESTAMP_HEADER);

    if (!signature) {
      throw new WebhookVerificationError(
        "MISSING_SIGNATURE",
        `Missing ${WEBHOOK_SIGNATURE_HEADER} header`,
      );
    }

    if (!timestamp) {
      throw new WebhookVerificationError(
        "MISSING_TIMESTAMP",
        `Missing ${WEBHOOK_TIMESTAMP_HEADER} header`,
      );
    }

    if (!signature.startsWith(SIGNATURE_PREFIX)) {
      throw new WebhookVerificationError(
        "INVALID_SIGNATURE_FORMAT",
        "Signature header must start with v1=",
      );
    }

    const timestampNum = Number(timestamp);
    if (!Number.isFinite(timestampNum)) {
      throw new WebhookVerificationError(
        "INVALID_TIMESTAMP",
        "Timestamp header must be a number (milliseconds since epoch)",
      );
    }

    const toleranceMs = options.tolerance ?? DEFAULT_TOLERANCE_MS;
    const now = Date.now();
    if (toleranceMs >= 0 && Math.abs(now - timestampNum) > toleranceMs) {
      throw new WebhookVerificationError(
        "TIMESTAMP_OUT_OF_RANGE",
        "Webhook timestamp is outside the allowed tolerance",
      );
    }

    const bodyString = toUtf8String(body);
    const expected = computeSignature(webhookSecret, timestamp, bodyString);

    if (!safeEqual(expected, signature)) {
      throw new WebhookVerificationError(
        "SIGNATURE_MISMATCH",
        "Webhook signature does not match",
      );
    }
  }
}

function computeSignature(secret: string, timestamp: string, body: string) {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${body}`);
  return `${SIGNATURE_PREFIX}${hmac.digest("hex")}`;
}

function toUtf8String(body: RawBody): string {
  if (typeof body === "string") {
    return body;
  }

  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body).toString("utf8");
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString(
      "utf8",
    );
  }

  throw new WebhookVerificationError(
    "INVALID_BODY",
    "Unsupported raw body type",
  );
}

function getHeader(headers: HeaderLike, name: string): string | null {
  if (!headers) {
    return null;
  }

  if (typeof (headers as Headers).get === "function") {
    const headerValue = (headers as Headers).get(name);
    if (headerValue !== null) {
      return headerValue;
    }
  }

  const lowerName = name.toLowerCase();
  const record = headers as Record<string, string | string[] | undefined>;
  const matchingKey = Object.keys(record).find(
    (key) => key.toLowerCase() === lowerName,
  );

  if (!matchingKey) {
    return null;
  }

  const value = record[matchingKey];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

export type {
  WebhookEvent,
  WebhookEventData,
  WebhookEventPayloadMap,
  WebhookEventType,
};
