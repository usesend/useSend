import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";

let warnedUnmatchedAdminEmail = false;

/**
 * Platform admins manage instance-wide settings (SES configuration, teams,
 * waitlist). When ADMIN_EMAIL is set, only that user is admin. Without it, a
 * self-hosted instance falls back to its first registered user, and cloud has
 * no admin.
 *
 * On self-hosted, if ADMIN_EMAIL is set but no account has that email (a typo
 * or different casing), the first registered user stays admin so the instance
 * isn't locked out of its own Admin page.
 */
export async function isPlatformAdmin(user: {
  id: number;
  email?: string | null;
}) {
  if (env.ADMIN_EMAIL) {
    if (user.email === env.ADMIN_EMAIL) {
      return true;
    }

    if (env.NEXT_PUBLIC_IS_CLOUD) {
      return false;
    }

    const adminUser = await db.user.findFirst({
      where: { email: env.ADMIN_EMAIL },
      select: { id: true },
    });

    if (adminUser) {
      return false;
    }

    if (!warnedUnmatchedAdminEmail) {
      warnedUnmatchedAdminEmail = true;
      logger.warn(
        "[PlatformAdmin]: ADMIN_EMAIL does not match any account (it must match exactly); the first registered user is the admin until it does",
      );
    }
  } else if (env.NEXT_PUBLIC_IS_CLOUD) {
    return false;
  }

  const firstUser = await db.user.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });

  return firstUser?.id === user.id;
}
