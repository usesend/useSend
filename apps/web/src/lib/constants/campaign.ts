export const CAMPAIGN_UNSUBSCRIBE_VARIABLE = "usesend_unsubscribe_url";
export const LEGACY_CAMPAIGN_UNSUBSCRIBE_VARIABLE = "unsend_unsubscribe_url";

export const CAMPAIGN_UNSUBSCRIBE_VARIABLES = [
  CAMPAIGN_UNSUBSCRIBE_VARIABLE,
  LEGACY_CAMPAIGN_UNSUBSCRIBE_VARIABLE,
] as const;

export const CAMPAIGN_UNSUBSCRIBE_PLACEHOLDER_TOKENS =
  CAMPAIGN_UNSUBSCRIBE_VARIABLES.map((variable) => `{{${variable}}}`);

const CAMPAIGN_EDITOR_BASE_VARIABLES = [
  "email",
  "firstName",
  "lastName",
  CAMPAIGN_UNSUBSCRIBE_VARIABLE,
];

export function getCampaignEditorVariables(
  contactBookVariables: string[] = [],
) {
  return Array.from(
    new Set([...CAMPAIGN_EDITOR_BASE_VARIABLES, ...contactBookVariables]),
  );
}

export function getCampaignUnsubscribeVariableValues(unsubscribeUrl: string) {
  return Object.fromEntries(
    CAMPAIGN_UNSUBSCRIBE_VARIABLES.map((variable) => [
      variable,
      unsubscribeUrl,
    ]),
  );
}
