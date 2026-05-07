import { Contact } from "@prisma/client";
import { getContactPropertyValue } from "~/lib/contact-properties";

const CONTACT_VARIABLE_REGEX =
  /\{\{\s*(?:contact\.)?([a-zA-Z0-9_]+)(?:\s*,\s*fallback=([^}]+))?\s*\}\}/gi;

export const BUILT_IN_CONTACT_VARIABLES = [
  "email",
  "firstName",
  "lastName",
] as const;

export function getContactReplacementValue({
  contact,
  key,
  allowedVariables,
}: {
  contact: Contact;
  key: string;
  allowedVariables: string[];
}) {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === "email") {
    return contact.email;
  }

  if (normalizedKey === "firstname") {
    return contact.firstName;
  }

  if (normalizedKey === "lastname") {
    return contact.lastName;
  }

  const variableMap = new Map(
    allowedVariables.map((variable) => [variable.toLowerCase(), variable]),
  );
  const matchedVariable = variableMap.get(normalizedKey);
  if (!matchedVariable) {
    return undefined;
  }

  if (!contact.properties || typeof contact.properties !== "object") {
    return undefined;
  }

  return getContactPropertyValue(
    contact.properties as Record<string, unknown>,
    matchedVariable,
    allowedVariables,
  );
}

export function createCaseInsensitiveVariableValues(
  values: Record<string, string | null | undefined>,
) {
  const normalizedValues = Object.entries(values).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
        acc[key.toLowerCase()] = value;
      }

      return acc;
    },
    {} as Record<string, string | null>,
  );

  // eslint-disable-next-line no-undef
  return new Proxy(normalizedValues, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const exact = Reflect.get(target, prop, receiver);
        if (exact !== undefined) {
          return exact;
        }

        return Reflect.get(target, prop.toLowerCase(), receiver);
      }

      return Reflect.get(target, prop, receiver);
    },
  }) as Record<string, string | null>;
}

export function replaceContactVariables(
  value: string,
  contact: Contact,
  allowedVariables: string[],
) {
  return value.replace(
    CONTACT_VARIABLE_REGEX,
    (match: string, key: string, fallback?: string) => {
      const normalizedKey = key.toLowerCase();
      const isBuiltIn = BUILT_IN_CONTACT_VARIABLES.some(
        (variable) => variable.toLowerCase() === normalizedKey,
      );
      const isAllowedRegistryVariable = allowedVariables.some(
        (variable) => variable.toLowerCase() === normalizedKey,
      );

      if (!isBuiltIn && !isAllowedRegistryVariable) {
        return match;
      }

      const contactValue = getContactReplacementValue({
        contact,
        key,
        allowedVariables,
      });

      if (contactValue && contactValue.length > 0) {
        return contactValue;
      }

      return fallback ?? "";
    },
  );
}
