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
