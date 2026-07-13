import { Prisma } from "@prisma/client";
import {
  normalizeContactSegmentDefinition,
  type ContactSegmentCondition,
  type ContactSegmentDefinition,
} from "~/lib/contact-segments";

export function buildContactSegmentWhere(
  definition: ContactSegmentDefinition,
  allowedVariables: string[],
): Prisma.ContactWhereInput {
  const normalizedDefinition = normalizeContactSegmentDefinition(
    definition,
    allowedVariables,
  );

  return {
    AND: normalizedDefinition.conditions.map((condition) =>
      buildContactSegmentConditionWhere(condition),
    ),
  };
}

function buildContactSegmentConditionWhere(
  condition: ContactSegmentCondition,
): Prisma.ContactWhereInput {
  const path = [condition.field];

  switch (condition.operator) {
    case "equals":
      return {
        properties: {
          path,
          equals: condition.value,
        },
      };
    case "contains":
      return {
        properties: {
          path,
          string_contains: condition.value,
        },
      };
    case "isSet":
      return {
        NOT: {
          properties: {
            path,
            equals: Prisma.DbNull,
          },
        },
      };
    case "isNotSet":
      return {
        properties: {
          path,
          equals: Prisma.DbNull,
        },
      };
  }
}
