export function toContactPropertyRecord(
  properties: unknown,
): Record<string, string> {
  if (!properties || typeof properties !== "object") {
    return {};
  }

  return Object.entries(properties as Record<string, unknown>).reduce(
    (acc, [key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        acc[key] = String(value);
      }

      return acc;
    },
    {} as Record<string, string>,
  );
}

export function getContactPropertyValue(
  properties: unknown,
  key: string,
): string | undefined {
  const propertyRecord = toContactPropertyRecord(properties);
  const match = Object.keys(propertyRecord).find(
    (candidate) => candidate.toLowerCase() === key.toLowerCase(),
  );

  return match ? propertyRecord[match] : undefined;
}

export function normalizePropertyHeader(
  header: string,
  contactBookVariables: string[],
): string {
  const trimmedHeader = header.trim();
  const matchedVariable = contactBookVariables.find(
    (variable) => variable.toLowerCase() === trimmedHeader.toLowerCase(),
  );

  return matchedVariable ?? trimmedHeader;
}

export function mergeContactPropertiesWithVariableValues({
  properties,
  variableValues,
  contactBookVariables,
}: {
  properties: unknown;
  variableValues: Record<string, string>;
  contactBookVariables: string[];
}): Record<string, string> {
  const normalizedProperties = toContactPropertyRecord(properties);
  const variableLookup = new Set(
    contactBookVariables.map((variable) => variable.toLowerCase()),
  );

  const mergedProperties = Object.entries(normalizedProperties).reduce(
    (acc, [key, value]) => {
      if (!variableLookup.has(key.toLowerCase())) {
        acc[key] = value;
      }

      return acc;
    },
    {} as Record<string, string>,
  );

  for (const variable of contactBookVariables) {
    const value = variableValues[variable]?.trim();
    if (value) {
      mergedProperties[variable] = value;
    }
  }

  return mergedProperties;
}
