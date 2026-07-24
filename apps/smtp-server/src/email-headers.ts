import type { HeaderLines } from "mailparser";

// These headers are represented by first-class API fields, rebuilt when
// Nodemailer creates the outbound MIME message, or added by the receiving MTA.
const NON_FORWARDABLE_HEADERS = new Set([
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

const NON_FORWARDABLE_PREFIXES = [
  "arc-",
  "resent-",
  "x-ses-",
  "x-unsend-",
  "x-usesend-",
];

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function shouldForwardHeader(name: string): boolean {
  return (
    !NON_FORWARDABLE_HEADERS.has(name) &&
    !NON_FORWARDABLE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * Extracts end-to-end headers that remain meaningful after useSend rebuilds
 * the MIME message. Repeated headers use the last value because the public API
 * currently accepts a string record rather than an ordered header list.
 */
export function extractForwardedHeaders(
  headerLines: HeaderLines | undefined,
): Record<string, string> | undefined {
  const headers = new Map<string, { name: string; value: string }>();

  for (const { key, line } of headerLines ?? []) {
    const normalizedName = key.toLowerCase();
    if (!shouldForwardHeader(normalizedName)) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const name = line.slice(0, colonIndex).trim();
    if (
      !HEADER_NAME_PATTERN.test(name) ||
      name.toLowerCase() !== normalizedName
    ) {
      continue;
    }

    // headerLines contains the original folded representation. Unfold valid
    // continuation lines before passing values through the JSON API.
    const value = line
      .slice(colonIndex + 1)
      .replace(/\r?\n[ \t]+/g, " ")
      .trim();

    if (!value || /[\r\n]/.test(value)) {
      continue;
    }

    headers.set(normalizedName, { name, value });
  }

  if (headers.size === 0) {
    return undefined;
  }

  return Object.fromEntries(
    [...headers.values()].map(({ name, value }) => [name, value]),
  );
}
