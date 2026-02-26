import { customAlphabet } from "nanoid";

const ID_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ID_SUFFIX_LENGTH = 16;

const nextIdSuffix = customAlphabet(ID_ALPHABET, ID_SUFFIX_LENGTH);

export const ID_PREFIX = {
  userPublic: "usr",
  teamPublic: "tm",
  domainPublic: "dom",
  apiKeyPublic: "ak",
  sesSetting: "ses",
  teamInvite: "inv",
  email: "em",
  emailEvent: "evt",
  contactBook: "cb",
  contact: "ct",
  campaign: "cmp",
  template: "tpl",
  suppression: "sup",
  webhook: "wh",
  webhookCall: "call",
} as const;

export type IdKind = keyof typeof ID_PREFIX;
type PrefixFor<K extends IdKind> = (typeof ID_PREFIX)[K];
export type IdFor<K extends IdKind> = `${PrefixFor<K>}_${string}`;

export function newId<K extends IdKind>(kind: K): IdFor<K> {
  const prefix = ID_PREFIX[kind];
  return `${prefix}_${nextIdSuffix()}` as IdFor<K>;
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
