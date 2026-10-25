import { env } from "~/env";
import { db } from "~/server/db";

/**
 * Platform admins manage instance-wide settings (SES configuration, teams,
 * waitlist). When ADMIN_EMAIL is set, only that user is admin. Without it, a
 * self-hosted instance falls back to its first registered user, and cloud has
 * no admin.
 */
export async function isPlatformAdmin(user: {
  id: number;
  email?: string | null;
}) {
  if (env.ADMIN_EMAIL) {
    return user.email === env.ADMIN_EMAIL;
  }

  if (env.NEXT_PUBLIC_IS_CLOUD) {
    return false;
  }

  const firstUser = await db.user.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });

  return firstUser?.id === user.id;
}
