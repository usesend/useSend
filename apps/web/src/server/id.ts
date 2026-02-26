import { customAlphabet } from "nanoid";

const ID_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ID_SUFFIX_LENGTH = 16;

const nextIdSuffix = customAlphabet(ID_ALPHABET, ID_SUFFIX_LENGTH);

function createId(prefix: string) {
  return `${prefix}_${nextIdSuffix()}`;
}

export function parseNumericId(input: string): number | null {
  if (!/^\d+$/.test(input)) {
    return null;
  }

  const parsed = Number(input);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function createUserPublicId() {
  return createId("usr");
}

export function createTeamPublicId() {
  return createId("tm");
}

export function createDomainPublicId() {
  return createId("dom");
}

export function createApiKeyPublicId() {
  return createId("ak");
}

export function createSesSettingId() {
  return createId("ses");
}

export function createTeamInviteId() {
  return createId("inv");
}

export function createEmailId() {
  return createId("em");
}

export function createEmailEventId() {
  return createId("evt");
}

export function createContactBookId() {
  return createId("cb");
}

export function createContactId() {
  return createId("ct");
}

export function createCampaignId() {
  return createId("cmp");
}

export function createTemplateId() {
  return createId("tpl");
}

export function createSuppressionId() {
  return createId("sup");
}

export function createWebhookId() {
  return createId("wh");
}

export function createWebhookCallId() {
  return createId("call");
}
