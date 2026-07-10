import type { Prisma, PrismaClient } from "@prisma/client";

export const TEAM_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RegistrationClient = PrismaClient | Prisma.TransactionClient;

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getTeamInviteExpiry(now = new Date()) {
  return new Date(now.getTime() + TEAM_INVITE_TTL_MS);
}

export async function canRegisterSelfHostedUser(
  client: RegistrationClient,
  email: string,
  now = new Date(),
) {
  const normalizedEmail = normalizeAuthEmail(email);
  const existingUser = await client.user.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (existingUser) return true;

  const userCount = await client.user.count();
  if (userCount === 0) return true;

  const invite = await client.teamInvite.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
      expiresAt: { gt: now },
    },
    select: { id: true },
  });

  return Boolean(invite);
}
