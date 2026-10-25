import { lookup, type LookupAddress } from "node:dns";
import {
  Agent as HttpAgent,
  request as httpRequest,
  type IncomingMessage,
} from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { env } from "~/env";

type AddressPrefix = {
  bytes: number[];
  bits: number;
};

const SAVE_TIME_LOOKUP_TIMEOUT_MS = 3_000;

export const URL_NOT_PUBLIC_MESSAGE =
  "URL must point to a publicly reachable host. Private, loopback, and link-local addresses are not allowed.";

export class OutboundUrlNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundUrlNotAllowedError";
  }
}

const IPV4_BLOCKED_PREFIXES: AddressPrefix[] = [
  { bytes: [0, 0, 0, 0], bits: 8 }, // "this network"
  { bytes: [10, 0, 0, 0], bits: 8 }, // private
  { bytes: [100, 64, 0, 0], bits: 10 }, // carrier-grade NAT
  { bytes: [127, 0, 0, 0], bits: 8 }, // loopback
  { bytes: [169, 254, 0, 0], bits: 16 }, // link-local, cloud metadata
  { bytes: [172, 16, 0, 0], bits: 12 }, // private
  { bytes: [192, 0, 0, 0], bits: 24 }, // IETF protocol assignments
  { bytes: [192, 0, 2, 0], bits: 24 }, // TEST-NET-1
  { bytes: [192, 88, 99, 0], bits: 24 }, // deprecated 6to4 relay anycast
  { bytes: [192, 168, 0, 0], bits: 16 }, // private
  { bytes: [198, 18, 0, 0], bits: 15 }, // benchmarking
  { bytes: [198, 51, 100, 0], bits: 24 }, // TEST-NET-2
  { bytes: [203, 0, 113, 0], bits: 24 }, // TEST-NET-3
  { bytes: [224, 0, 0, 0], bits: 4 }, // multicast
  { bytes: [240, 0, 0, 0], bits: 4 }, // reserved
];

function ipv6Prefix(groups: number[], bits: number): AddressPrefix {
  const bytes: number[] = [];
  for (const group of groups) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  while (bytes.length < 16) {
    bytes.push(0);
  }
  return { bytes, bits };
}

const IPV6_BLOCKED_PREFIXES: AddressPrefix[] = [
  ipv6Prefix([0, 0, 0, 0, 0, 0, 0, 0], 96), // IPv4-compatible, includes ::
  ipv6Prefix([0, 0, 0, 0, 0, 0, 0, 1], 128), // loopback ::1
  ipv6Prefix([0xfc00, 0, 0, 0, 0, 0, 0, 0], 7), // unique local
  ipv6Prefix([0xfe80, 0, 0, 0, 0, 0, 0, 0], 10), // link-local
  ipv6Prefix([0xfec0, 0, 0, 0, 0, 0, 0, 0], 10), // deprecated site-local
  ipv6Prefix([0xff00, 0, 0, 0, 0, 0, 0, 0], 8), // multicast
  ipv6Prefix([0x0100, 0, 0, 0, 0, 0, 0, 0], 64), // discard-only
  ipv6Prefix([0x2001, 0, 0, 0, 0, 0, 0, 0], 32), // Teredo
  ipv6Prefix([0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], 32), // documentation
];

type EmbeddedIpv4Prefix = {
  prefix: AddressPrefix;
  offset: number;
};

const IPV4_EMBEDDED_PREFIXES: EmbeddedIpv4Prefix[] = [
  { prefix: ipv6Prefix([0, 0, 0, 0, 0, 0xffff, 0, 0], 96), offset: 12 }, // ::ffff:0:0/96
  { prefix: ipv6Prefix([0x0064, 0xff9b, 0, 0, 0, 0, 0, 0], 96), offset: 12 }, // 64:ff9b::/96
  { prefix: ipv6Prefix([0x2002, 0, 0, 0, 0, 0, 0, 0], 16), offset: 2 }, // 6to4 2002::/16
];

function withinPrefix(bytes: number[], prefix: AddressPrefix): boolean {
  let remaining = prefix.bits;
  for (let index = 0; index < bytes.length && remaining > 0; index++) {
    const take = Math.min(8, remaining);
    const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff;
    if ((bytes[index]! & mask) !== (prefix.bytes[index]! & mask)) {
      return false;
    }
    remaining -= take;
  }
  return true;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (value > 255) {
      return null;
    }
    octets.push(value);
  }
  return octets;
}

function parseIpv6(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) {
    return null;
  }

  const readGroups = (section: string): number[] | null => {
    const groups: number[] = [];
    if (section === "") {
      return groups;
    }

    const parts = section.split(":");
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!;
      if (part.includes(".")) {
        if (index !== parts.length - 1) {
          return null;
        }
        const octets = parseIpv4(part);
        if (!octets) {
          return null;
        }
        groups.push(
          (octets[0]! << 8) | octets[1]!,
          (octets[2]! << 8) | octets[3]!,
        );
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) {
          return null;
        }
        groups.push(parseInt(part, 16));
      }
    }
    return groups;
  };

  const head = readGroups(halves[0]!);
  const tail = halves.length === 2 ? readGroups(halves[1]!) : [];
  if (!head || !tail) {
    return null;
  }

  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) {
      return null;
    }
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    groups = head;
  }

  if (groups.length !== 8) {
    return null;
  }

  const bytes: number[] = [];
  for (const group of groups) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  return bytes;
}

function isNonPublicIpv4(octets: number[]): boolean {
  return IPV4_BLOCKED_PREFIXES.some((prefix) => withinPrefix(octets, prefix));
}

/**
 * True when the address is not a globally routable unicast address. Unparsable
 * input is treated as non-public so that an unknown address is never dialed.
 */
export function isNonPublicIpAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().split("%")[0]!;
  const version = isIP(normalized);

  if (version === 4) {
    const octets = parseIpv4(normalized);
    return octets === null ? true : isNonPublicIpv4(octets);
  }

  if (version === 6) {
    const bytes = parseIpv6(normalized);
    if (!bytes) {
      return true;
    }

    for (const embedded of IPV4_EMBEDDED_PREFIXES) {
      if (withinPrefix(bytes, embedded.prefix)) {
        return isNonPublicIpv4(
          bytes.slice(embedded.offset, embedded.offset + 4),
        );
      }
    }

    return IPV6_BLOCKED_PREFIXES.some((prefix) => withinPrefix(bytes, prefix));
  }

  return true;
}

function privateAddressesAllowed() {
  return env.OUTBOUND_ALLOW_PRIVATE_ADDRESSES;
}

function urlHostname(url: URL) {
  return url.hostname.replace(/^\[/, "").replace(/\]$/, "");
}

/**
 * Parse the URL and enforce the scheme. An IP literal host is checked here
 * because no DNS lookup happens for it at connect time.
 */
function parseOutboundUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OutboundUrlNotAllowedError("URL is not a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OutboundUrlNotAllowedError(
      "URL must use the http or https scheme.",
    );
  }

  const hostname = urlHostname(parsed);
  if (hostname === "") {
    throw new OutboundUrlNotAllowedError("URL must include a host.");
  }

  if (
    !privateAddressesAllowed() &&
    isIP(hostname) !== 0 &&
    isNonPublicIpAddress(hostname)
  ) {
    throw new OutboundUrlNotAllowedError(URL_NOT_PUBLIC_MESSAGE);
  }

  return parsed;
}

/**
 * Connect-time DNS lookup that refuses non-public addresses. The socket dials
 * the address checked here, so a hostname cannot pass the check and then
 * rebind to an internal address before the connection is made.
 */
export const publicOnlyLookup: LookupFunction = (
  hostname,
  options,
  callback,
) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "");
      return;
    }

    if (addresses.length === 0) {
      callback(
        new OutboundUrlNotAllowedError(
          `Host ${hostname} resolved to no address.`,
        ),
        "",
      );
      return;
    }

    if (addresses.some((entry) => isNonPublicIpAddress(entry.address))) {
      callback(new OutboundUrlNotAllowedError(URL_NOT_PUBLIC_MESSAGE), "");
      return;
    }

    if (options.all) {
      callback(null, addresses);
      return;
    }

    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

function resolveWithTimeout(hostname: string): Promise<LookupAddress[] | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), SAVE_TIME_LOOKUP_TIMEOUT_MS);
    lookup(hostname, { all: true }, (error, addresses) => {
      clearTimeout(timer);
      resolve(error ? null : addresses);
    });
  });
}

/**
 * Validate a URL before it is stored. IP literals and hostnames that resolve
 * to non-public addresses are rejected. A failed or slow lookup is not a
 * rejection, because every request checks the address again when it connects.
 */
export async function assertOutboundUrlAllowed(url: string): Promise<void> {
  const parsed = parseOutboundUrl(url);
  const hostname = urlHostname(parsed);

  if (privateAddressesAllowed() || isIP(hostname) !== 0) {
    return;
  }

  const addresses = await resolveWithTimeout(hostname);
  if (addresses?.some((entry) => isNonPublicIpAddress(entry.address))) {
    throw new OutboundUrlNotAllowedError(URL_NOT_PUBLIC_MESSAGE);
  }
}

type OutboundRequestInit = {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const httpAgent = new HttpAgent();
const httpsAgent = new HttpsAgent();

function toWebResponse(response: IncomingMessage): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        headers.append(name, item);
      }
    }
  }

  const status = response.statusCode ?? 0;
  const hasBody = !NULL_BODY_STATUSES.has(status);
  if (!hasBody) {
    response.resume();
  }

  return new Response(
    hasBody ? (Readable.toWeb(response) as ReadableStream<Uint8Array>) : null,
    { status, statusText: response.statusMessage, headers },
  );
}

/**
 * Send a request to a user-supplied URL. Non-public targets are refused at
 * connect time and redirects are never followed. The DNS lookup runs inside
 * the request, so `signal` bounds it too. Callers must read or cancel the
 * response body.
 */
export function fetchOutbound(
  url: string,
  init: OutboundRequestInit,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = parseOutboundUrl(url);
    const headers = { ...init.headers };
    if (init.body !== undefined) {
      headers["Content-Length"] = String(Buffer.byteLength(init.body));
    }

    const isHttps = parsed.protocol === "https:";
    const send = isHttps ? httpsRequest : httpRequest;
    const request = send(
      parsed,
      {
        method: init.method,
        headers,
        signal: init.signal,
        agent: isHttps ? httpsAgent : httpAgent,
        lookup: privateAddressesAllowed() ? undefined : publicOnlyLookup,
      },
      (response) => {
        try {
          resolve(toWebResponse(response));
        } catch (error) {
          response.destroy();
          reject(error);
        }
      },
    );

    request.on("error", reject);
    request.end(init.body);
  });
}
