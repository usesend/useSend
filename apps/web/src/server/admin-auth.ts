import { createHash, timingSafeEqual } from "crypto";

/**
 * Pure helpers for the internal admin API, kept free of db and env imports so
 * they can be unit tested.
 */

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether `authorization` is `Bearer <expected>`. Compares digests in constant
 * time, so neither the token nor its length leaks through timing. Never true
 * without an expected token.
 */
export function isAdminAuthorized(
  authorization: string | null | undefined,
  expected: string | undefined,
) {
  if (!expected || !authorization) return false;
  const match = authorization.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match?.[1]) return false;
  return timingSafeEqual(digest(match[1]), digest(expected));
}
