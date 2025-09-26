const RESERVED_EMAIL_HEADERS = new Set(
  ["x-usesend-email-id", "references"].map((header) =>
    header.toLowerCase()
  )
);

const HEADER_INJECTION_PATTERN = /[\r\n]/;

/**
 * Removes reserved headers and values that could result in header injection.
 * Returns `undefined` when the resulting object is empty so downstream callers
 * can skip persisting redundant data.
 */
export function sanitizeHeader(
  rawName: unknown,
  rawValue: unknown
): { name: string; value: string } | undefined {
  if (typeof rawName !== "string" || typeof rawValue !== "string") {
    return undefined;
  }

  const name = rawName.trim();
  if (!name || RESERVED_EMAIL_HEADERS.has(name.toLowerCase())) {
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
  headers?: Record<string, string | null | undefined>
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(headers)
    .map(([name, value]) => sanitizeHeader(name, value))
    .filter((entry): entry is { name: string; value: string } => Boolean(entry));

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return sanitizedEntries.reduce((acc, { name, value }) => {
    acc[name] = value;
    return acc;
  }, {} as Record<string, string>);
}
