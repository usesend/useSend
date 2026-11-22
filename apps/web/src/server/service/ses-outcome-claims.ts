import { logger } from "~/server/logger/log";
import { getRedis, redisKey } from "~/server/redis";

// SES can deliver the same hard bounce or complaint more than once. A short
// Redis claim per email makes each one count once in the usage counters, and
// run the sending rules once.

const OUTCOME_CLAIM_SECONDS = 14 * 24 * 60 * 60;

export type Outcome = "hardBounced" | "complained";

export type OutcomeClaim = "claimed" | "duplicate" | "unavailable";

function outcomeKey(emailId: string, outcome: Outcome) {
  return redisKey(`ses-outcome:${emailId}:${outcome}`);
}

/**
 * Claims a hard bounce or complaint for an email, atomically across workers.
 * "unavailable" means Redis failed: the caller still updates the counters, as
 * before this existed, but doesn't run the sending rules.
 */
export async function claimOutcome(
  emailId: string,
  outcome: Outcome,
): Promise<OutcomeClaim> {
  try {
    const claimed = await getRedis().set(
      outcomeKey(emailId, outcome),
      "1",
      "EX",
      OUTCOME_CLAIM_SECONDS,
      "NX",
    );
    return claimed === "OK" ? "claimed" : "duplicate";
  } catch (error) {
    logger.warn({ err: error, emailId }, "[SesOutcomeClaims]: claim failed");
    return "unavailable";
  }
}

/** Gives a claim back when the work it guarded failed, so a retry can redo it. */
export async function releaseOutcome(emailId: string, outcome: Outcome) {
  try {
    await getRedis().del(outcomeKey(emailId, outcome));
  } catch (error) {
    logger.warn({ err: error, emailId }, "[SesOutcomeClaims]: release failed");
  }
}
