import { nanoid } from "../nanoid";

const RESERVED_EMAIL_HEADERS = new Set([
  "authentication-results",
  "bcc",
  "cc",
  "content-disposition",
  "content-id",
  "content-length",
  "content-md5",
  "content-transfer-encoding",
  "content-type",
  "date",
  "delivered-to",
  "dkim-signature",
  "domainkey-signature",
  "envelope-to",
  "errors-to",
  "from",
  "message-id",
  "mime-version",
  "received",
  "received-spf",
  "reply-to",
  "return-path",
  "sender",
  "subject",
  "to",
  "x-envelope-to",
  "x-google-dkim-signature",
  "x-original-to",
  "x-received",
]);

const RESERVED_EMAIL_HEADER_PREFIXES = [
  "arc-",
  "resent-",
  "x-ses-",
  "x-unsend-",
  "x-usesend-",
];

const HEADER_INJECTION_PATTERN = /[\r\n]/;

/**
 * Removes reserved headers and values that could result in header injection.
 * Returns `undefined` when the resulting object is empty so downstream callers
 * can skip persisting redundant data.
 */
export function sanitizeHeader(
  rawName: unknown,
  rawValue: unknown,
): { name: string; value: string } | undefined {
  if (typeof rawName !== "string" || typeof rawValue !== "string") {
    return undefined;
  }

  const name = rawName.trim();
  const normalizedName = name.toLowerCase();
  if (
    !name ||
    RESERVED_EMAIL_HEADERS.has(normalizedName) ||
    RESERVED_EMAIL_HEADER_PREFIXES.some((prefix) =>
      normalizedName.startsWith(prefix),
    )
  ) {
    return undefined;
  }

  if (
    HEADER_INJECTION_PATTERN.test(name) ||
    HEADER_INJECTION_PATTERN.test(rawValue)
  ) {
    return undefined;
  }

  return { name, value: rawValue };
}

export function sanitizeCustomHeaders(
  headers?: Record<string, string | null | undefined>,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(headers)
    .map(([name, value]) => sanitizeHeader(name, value))
    .filter((entry): entry is { name: string; value: string } =>
      Boolean(entry),
    );

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return sanitizedEntries.reduce(
    (acc, { name, value }) => {
      acc[name] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
}

export function buildHeaders({
  emailId,
  headers,
  unsubUrl,
  isBulk,
  inReplyToMessageId,
}: {
  emailId?: string | undefined;
  headers?: Record<string, string> | undefined;
  unsubUrl?: string;
  isBulk?: boolean;
  inReplyToMessageId?: string | undefined;
}) {
  const sanitizedHeaders = sanitizeCustomHeaders(headers);
  const sanitizedHeaderNames = new Set(
    Object.keys(sanitizedHeaders ?? {}).map((name) => name.toLowerCase()),
  );

  const defaultHeaders: Record<string, string> = {};

  if (!sanitizedHeaderNames.has("x-entity-ref-id")) {
    defaultHeaders["X-Entity-Ref-ID"] = nanoid();
  }

  if (emailId) {
    defaultHeaders["X-Usesend-Email-ID"] = emailId;
  }

  if (unsubUrl) {
    if (!sanitizedHeaderNames.has("list-unsubscribe")) {
      defaultHeaders["List-Unsubscribe"] = `<${unsubUrl}>`;
    }

    if (!sanitizedHeaderNames.has("list-unsubscribe-post")) {
      defaultHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
  }

  if (isBulk && !sanitizedHeaderNames.has("precedence")) {
    defaultHeaders["Precedence"] = "bulk";
  }

  if (inReplyToMessageId) {
    const formattedMessageId = `<${inReplyToMessageId}@email.amazonses.com>`;

    if (!sanitizedHeaderNames.has("in-reply-to")) {
      defaultHeaders["In-Reply-To"] = formattedMessageId;
    }

    if (!sanitizedHeaderNames.has("references")) {
      defaultHeaders["References"] = formattedMessageId;
    }
  }

  return {
    ...defaultHeaders,
    ...(sanitizedHeaders ?? {}),
  };
}
