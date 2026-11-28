import addressparser from "nodemailer/lib/addressparser";

export type ParsedFromAddress = {
  name: string;
  address: string;
  domain: string;
};

/**
 * Parses a `from` value with the same parser nodemailer uses to build the
 * message, so the domain we authorize is the domain that goes on the wire.
 * Returns `undefined` unless the value is exactly one mailbox (no groups, no
 * lists) whose address has exactly one `@`.
 */
export function parseFromAddress(from: string): ParsedFromAddress | undefined {
  const entries = addressparser(from);
  if (entries.length !== 1) {
    return undefined;
  }

  const entry = entries[0];
  if (!entry || !("address" in entry) || !entry.address) {
    return undefined;
  }

  const [localPart, domain, ...rest] = entry.address.split("@");
  if (!localPart || !domain || rest.length > 0) {
    return undefined;
  }

  return { name: entry.name, address: entry.address, domain };
}

/**
 * How many mailboxes a list of to/cc/bcc entries reaches, parsed the way
 * Nodemailer does when it sends (one entry can hold "a@x.com, b@x.com"; a
 * quoted display name with a comma is still one mailbox; groups are expanded).
 */
export function countMailboxes(
  entries: Array<string | null | undefined>,
): number {
  let count = 0;
  for (const entry of entries) {
    if (!entry) continue;
    for (const parsed of addressparser(entry)) {
      const group = (parsed as { group?: Array<{ address?: string }> }).group;
      if (Array.isArray(group))
        count += group.filter((member) => member.address).length;
      else if (parsed.address) count += 1;
    }
  }
  return count;
}
