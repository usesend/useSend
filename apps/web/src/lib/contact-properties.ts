export function getCanonicalContactVariableName(
  key: string,
  allowedVariables: string[] = [],
) {
  const normalizedKey = key.trim().toLowerCase();

  return allowedVariables.find(
    (variable) => variable.toLowerCase() === normalizedKey,
  );
}

export function normalizeContactProperties(
  properties?: Record<string, unknown> | null,
  allowedVariables: string[] = [],
) {
  const normalizedProperties: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties ?? {})) {
    const canonicalKey = getCanonicalContactVariableName(key, allowedVariables);
    normalizedProperties[canonicalKey ?? key] = value;
  }

  return normalizedProperties;
}

export function getContactPropertyValue(
  properties: Record<string, unknown> | null | undefined,
  key: string,
  allowedVariables: string[] = [],
) {
  const normalizedKey = key.toLowerCase();
  const canonicalKey = getCanonicalContactVariableName(key, allowedVariables);

  const propertyKey = Object.keys(properties ?? {}).find((candidate) => {
    const normalizedCandidate = candidate.toLowerCase();

    return (
      normalizedCandidate === normalizedKey ||
      normalizedCandidate === canonicalKey?.toLowerCase()
    );
  });

  const propertyValue = propertyKey ? properties?.[propertyKey] : undefined;

  if (
    typeof propertyValue === "string" ||
    typeof propertyValue === "number" ||
    typeof propertyValue === "boolean"
  ) {
    return String(propertyValue);
  }

  return undefined;
}

export function mergeContactProperties(
  existingProperties?: Record<string, unknown> | null,
  incomingProperties?: Record<string, unknown> | null,
  allowedVariables: string[] = [],
) {
  return {
    ...normalizeContactProperties(existingProperties, allowedVariables),
    ...normalizeContactProperties(incomingProperties, allowedVariables),
  };
}

export function replaceContactVariableValues(
  existingProperties: Record<string, unknown> | null | undefined,
  variableValues: Record<string, unknown>,
  allowedVariables: string[] = [],
) {
  const normalizedExistingProperties = normalizeContactProperties(
    existingProperties,
    allowedVariables,
  );

  for (const key of Object.keys(normalizedExistingProperties)) {
    if (getCanonicalContactVariableName(key, allowedVariables)) {
      delete normalizedExistingProperties[key];
    }
  }

  return mergeContactProperties(
    normalizedExistingProperties,
    variableValues,
    allowedVariables,
  );
}
