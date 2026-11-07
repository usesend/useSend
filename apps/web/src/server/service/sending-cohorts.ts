import type { Prisma } from "@prisma/client";
import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { getRedis, redisKey } from "~/server/redis";

// Sends and the hard bounces and complaints they cause, filed under the day
// each email was counted as sent. The day is stored on the email itself, so
// an outcome only counts for an email whose send was counted, on that day.

const OUTCOME_CLAIM_SECONDS = 14 * 24 * 60 * 60;

export type Outcome = "hardBounced" | "complained";

function day(date: Date) {
  return date.toISOString().split("T")[0] as string;
}

/**
 * Saves the email after SES accepted it. On cloud, in the same transaction,
 * counts the send in the team's cohort for today (and its campaign) and marks
 * the email with that day. If counting fails, the email is still saved,
 * unmarked, so its bounces and complaints won't count either.
 */
export async function saveSentEmail(
  email: { id: string; teamId: number; campaignId: string | null },
  data: Prisma.EmailUpdateInput,
) {
  if (!env.NEXT_PUBLIC_IS_CLOUD) {
    await db.email.update({ where: { id: email.id }, data });
    return;
  }

  const date = day(new Date());
  try {
    await db.$transaction([
      db.sendingCohort.upsert({
        where: { teamId_date: { teamId: email.teamId, date } },
        create: { teamId: email.teamId, date, sent: 1 },
        update: { sent: { increment: 1 } },
      }),
      ...(email.campaignId
        ? [
            db.campaign.update({
              where: { id: email.campaignId },
              data: { acceptedSends: { increment: 1 } },
            }),
          ]
        : []),
      db.email.update({
        where: { id: email.id },
        data: { ...data, cohortDate: date },
      }),
    ]);
  } catch (error) {
    logger.error(
      { err: error, emailId: email.id },
      "[SendingCohorts]: Counting the send failed",
    );
    await db.email.update({ where: { id: email.id }, data });
  }
}

/**
 * Claims a hard bounce or complaint for an email, so a repeated SES event
 * counts once. Atomic across workers. If Redis fails it doesn't count the
 * event: undercounting can't wrongly pause anyone.
 */
export async function claimOutcome(emailId: string, outcome: Outcome) {
  try {
    const claimed = await getRedis().set(
      redisKey(`ses-outcome:${emailId}:${outcome}`),
      "1",
      "EX",
      OUTCOME_CLAIM_SECONDS,
      "NX",
    );
    return claimed === "OK";
  } catch (error) {
    logger.warn({ err: error, emailId }, "[SendingCohorts]: claim failed");
    return false;
  }
}

/**
 * Files a hard bounce or complaint under the day its email was counted as
 * sent. Emails without that mark (sent before this existed, by an older
 * worker, or whose count failed) are skipped. Returns whether it counted.
 */
export async function recordOutcome(
  email: {
    teamId: number;
    campaignId: string | null;
    cohortDate: string | null;
  },
  outcome: Outcome,
) {
  if (!env.NEXT_PUBLIC_IS_CLOUD || !email.cohortDate) return false;

  const date = email.cohortDate;
  const campaignField =
    outcome === "hardBounced" ? "acceptedHardBounced" : "acceptedComplained";
  await db.$transaction([
    db.sendingCohort.upsert({
      where: { teamId_date: { teamId: email.teamId, date } },
      create: { teamId: email.teamId, date, [outcome]: 1 },
      update: { [outcome]: { increment: 1 } },
    }),
    ...(email.campaignId
      ? [
          db.campaign.updateMany({
            where: { id: email.campaignId },
            data: { [campaignField]: { increment: 1 } },
          }),
        ]
      : []),
  ]);
  return true;
}
