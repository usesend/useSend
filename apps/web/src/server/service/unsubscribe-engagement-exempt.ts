import { env } from "~/env";

/** Destination URLs for opt-out should not increment campaign click/open-style engagement. */
export function isUnsubscribeEngagementExemptLink(
  link: string | undefined,
): boolean {
  if (!link) {
    return false;
  }
  try {
    const u = new URL(link);
    return /\bunsubscribe\b/i.test(`${u.pathname}${u.search}`);
  } catch {
    const prefix = env.NEXTAUTH_URL.replace(/\/$/, "");
    return (
      link.startsWith(`${prefix}/unsubscribe`) ||
      /\/api\/unsubscribe/i.test(link)
    );
  }
}
