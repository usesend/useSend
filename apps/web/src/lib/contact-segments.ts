import { z } from "zod";
import {
  getCanonicalContactVariableName,
  getContactPropertyValue,
} from "~/lib/contact-properties";

export const contactSegmentOperatorSchema = z.enum([
  "equals",
  "contains",
  "isSet",
  "isNotSet",
]);

export type ContactSegmentOperator = z.infer<
  typeof contactSegmentOperatorSchema
>;

export const contactSegmentConditionSchema = z
  .object({
    field: z.string().trim().min(1, "Field is required"),
    operator: contactSegmentOperatorSchema,
    value: z.string().trim().optional(),
  })
  .superRefine((condition, ctx) => {
    if (
      contactSegmentOperatorRequiresValue(condition.operator) &&
      !condition.value
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Value is required for this operator",
        path: ["value"],
      });
    }
  });

export const contactSegmentDefinitionSchema = z.object({
  conditions: z
    .array(contactSegmentConditionSchema)
    .min(1, "Add at least one condition")
    .max(20, "A segment can have at most 20 conditions"),
});

export type ContactSegmentCondition = z.infer<
  typeof contactSegmentConditionSchema
>;
export type ContactSegmentDefinition = z.infer<
  typeof contactSegmentDefinitionSchema
>;

export function contactSegmentOperatorRequiresValue(
  operator: ContactSegmentOperator,
) {
  return operator === "equals" || operator === "contains";
}

export function normalizeContactSegmentDefinition(
  definition: ContactSegmentDefinition,
  allowedVariables: string[],
) {
  return contactSegmentDefinitionSchema.parse({
    conditions: definition.conditions.map((condition) => {
      const canonicalField =
        getCanonicalContactVariableName(condition.field, allowedVariables) ??
        condition.field.trim();

      return {
        field: canonicalField,
        operator: condition.operator,
        ...(condition.value !== undefined
          ? { value: condition.value.trim() }
          : {}),
      };
    }),
  });
}

export function contactMatchesSegmentDefinition(
  properties: Record<string, unknown> | null | undefined,
  definition: ContactSegmentDefinition,
  allowedVariables: string[],
) {
  const normalizedDefinition = normalizeContactSegmentDefinition(
    definition,
    allowedVariables,
  );

  return normalizedDefinition.conditions.every((condition) => {
    const propertyValue = getContactPropertyValue(
      properties,
      condition.field,
      allowedVariables,
    );

    switch (condition.operator) {
      case "equals":
        return propertyValue === condition.value;
      case "contains":
        return propertyValue?.includes(condition.value ?? "") ?? false;
      case "isSet":
        return Boolean(propertyValue && propertyValue.length > 0);
      case "isNotSet":
        return !propertyValue;
    }
  });
}

export function describeContactSegmentDefinition(
  definition: ContactSegmentDefinition,
) {
  return definition.conditions
    .map((condition) => {
      switch (condition.operator) {
        case "equals":
          return `${condition.field} is "${condition.value}"`;
        case "contains":
          return `${condition.field} contains "${condition.value}"`;
        case "isSet":
          return `${condition.field} is set`;
        case "isNotSet":
          return `${condition.field} is not set`;
      }
    })
    .join(" and ");
}
