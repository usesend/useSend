import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type AddressPrefix = {
  bytes: number[];
  bits: number;
};

export const WEBHOOK_URL_NOT_PUBLIC_MESSAGE =
  "Webhook URL must point to a publicly reachable host. Private, loopback, and link-local addresses are not allowed.";

export class WebhookUrlNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookUrlNotAllowedError";
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
  ipv6Prefix([0xff00, 0, 0, 0, 0, 0, 0, 0], 8), // multicast
  ipv6Prefix([0x0100, 0, 0, 0, 0, 0, 0, 0], 64), // discard-only
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
        groups.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
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
        return isNonPublicIpv4(bytes.slice(embedded.offset, embedded.offset + 4));
      }
    }

    return IPV6_BLOCKED_PREFIXES.some((prefix) => withinPrefix(bytes, prefix));
  }

  return true;
}

/**
 * Reject webhook URLs that would make the server call its own network or the
 * cloud instance metadata service. The host is resolved and every returned
 * address is checked, so a public hostname that resolves to a private address
 * is rejected too.
 */
export async function assertWebhookUrlAllowed(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebhookUrlNotAllowedError("Webhook URL is not a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebhookUrlNotAllowedError(
      "Webhook URL must use the http or https scheme.",
    );
  }

  const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (hostname === "") {
    throw new WebhookUrlNotAllowedError("Webhook URL must include a host.");
  }

  if (isIP(hostname) !== 0) {
    if (isNonPublicIpAddress(hostname)) {
      throw new WebhookUrlNotAllowedError(WEBHOOK_URL_NOT_PUBLIC_MESSAGE);
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new WebhookUrlNotAllowedError(
      `Webhook URL host ${hostname} could not be resolved.`,
    );
  }

  if (addresses.length === 0) {
    throw new WebhookUrlNotAllowedError(
      `Webhook URL host ${hostname} resolved to no address.`,
    );
  }

  for (const entry of addresses) {
    if (isNonPublicIpAddress(entry.address)) {
      throw new WebhookUrlNotAllowedError(WEBHOOK_URL_NOT_PUBLIC_MESSAGE);
    }
  }
}
