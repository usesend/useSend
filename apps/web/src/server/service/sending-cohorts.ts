import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { getRedis, redisKey } from "~/server/redis";

// Sends and the hard bounces and complaints they cause, filed under the day
// each email was sent. The sending rules compare these, so a late complaint
// is always measured against the sends that caused it.

const OUTCOME_CLAIM_SECONDS = 14 * 24 * 60 * 60;

export type Outcome = "hardBounced" | "complained";

function day(date: Date) {
  return date.toISOString().split("T")[0] as string;
}

/** Counts an email the team just handed to SES. Never throws. */
export async function recordSend(teamId: number, at: Date = new Date()) {
  if (!env.NEXT_PUBLIC_IS_CLOUD) return;
  const date = day(at);
  try {
    await db.sendingCohort.upsert({
      where: { teamId_date: { teamId, date } },
      create: { teamId, date, sent: 1 },
      update: { sent: { increment: 1 } },
    });
  } catch (error) {
    logger.error({ err: error, teamId }, "[SendingCohorts]: recordSend failed");
  }
}

let trackingStart: Date | null = null;

/** When send counting began. Outcomes of emails sent earlier have no matching sends. */
async function getTrackingStart() {
  if (trackingStart) return trackingStart;
  const first = await db.sendingCohort.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  trackingStart = first?.createdAt ?? null;
  return trackingStart;
}

/**
 * Claims a hard bounce or complaint for an email, so a repeated SES event
 * counts once. Atomic across workers. If Redis is unavailable it counts the
 * event rather than dropping it.
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
    return true;
  }
}

/**
 * Files a hard bounce or complaint under the day its email was sent. Skips
 * emails sent before send counting began. Returns whether it was counted.
 */
export async function recordOutcome(
  teamId: number,
  sentAt: Date,
  outcome: Outcome,
) {
  if (!env.NEXT_PUBLIC_IS_CLOUD || Number.isNaN(sentAt.getTime())) {
    return false;
  }
  const start = await getTrackingStart();
  if (!start || sentAt < start) return false;

  const date = day(sentAt);
  await db.sendingCohort.upsert({
    where: { teamId_date: { teamId, date } },
    create: { teamId, date, [outcome]: 1 },
    update: { [outcome]: { increment: 1 } },
  });
  return true;
}

/** For tests. */
export function resetTrackingStartCache() {
  trackingStart = null;
}
