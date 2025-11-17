import { createHash } from "crypto";

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalize(value: unknown): CanonicalValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item) ?? null);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0)
    );

    const result: Record<string, CanonicalValue> = {};
    for (const [key, val] of entries) {
      const normalized = normalize(val);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    }

    return result;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return String(value);
}

export function canonicalizePayload(payload: unknown) {
  const normalized = normalize(payload);
  const canonical = JSON.stringify(normalized ?? null);
  const bodyHash = createHash("sha256").update(canonical).digest("hex");
  return { canonical, bodyHash };
}

