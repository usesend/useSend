export const CAMPAIGN_UNSUBSCRIBE_VARIABLE = "usesend_unsubscribe_url";
const LEGACY_CAMPAIGN_UNSUBSCRIBE_VARIABLE = "unsend_unsubscribe_url";

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
  return {
    [CAMPAIGN_UNSUBSCRIBE_VARIABLE]: unsubscribeUrl,
    [LEGACY_CAMPAIGN_UNSUBSCRIBE_VARIABLE]: unsubscribeUrl,
  };
}
