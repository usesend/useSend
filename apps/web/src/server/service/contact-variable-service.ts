export const CONTACT_VARIABLE_NAME_REGEX = /^[a-zA-Z0-9_]+$/;
const RESERVED_CONTACT_VARIABLES = new Set(["email", "firstname", "lastname"]);

export function normalizeContactBookVariables(variables?: string[]): string[] {
  if (!variables) {
    return [];
  }

  const deduped = new Map<string, string>();

  for (const variable of variables) {
    const trimmed = variable.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = trimmed.toLowerCase();
    if (!deduped.has(normalized)) {
      deduped.set(normalized, trimmed);
    }
  }

  return Array.from(deduped.values());
}

export function validateContactBookVariables(variables: string[]) {
  for (const variable of variables) {
    if (!CONTACT_VARIABLE_NAME_REGEX.test(variable)) {
      throw new Error(
        `Variable "${variable}" contains invalid characters. Use only letters, numbers, and underscores.`,
      );
    }

    if (RESERVED_CONTACT_VARIABLES.has(variable.toLowerCase())) {
      throw new Error(
        `Variable "${variable}" is reserved. Use a different name.`,
      );
    }
  }
}
