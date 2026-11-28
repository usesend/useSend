import { PLAN_LIMITS, LimitReason } from "~/lib/constants/plans";
import { env } from "~/env";
import { getThisMonthUsage } from "./usage-service";
import { TeamService } from "./team-service";
import { getRedis, redisKey, withCache } from "../redis";
import { emailTeam } from "./team-email";
import { newSenderDailyLimit, newSenderLimitEmail } from "./new-sender-ramp";
import { db } from "../db";
import { logger } from "../logger/log";
import { Plan } from "@prisma/client";

/**
 * Claims today's new-account allowance for one email's recipients.
 * KEYS[1]: hash of email id -> recipients claimed, plus "__total".
 * ARGV: email id, recipients, limit, ttl. A retry of the same email reuses
 * its claim; concurrent workers can't both take the last of the allowance.
 */
const RESERVE_SLOT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 1 end
local total = tonumber(redis.call('HGET', KEYS[1], '__total') or '0')
local wanted = tonumber(ARGV[2])
if total + wanted > tonumber(ARGV[3]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], wanted)
redis.call('HINCRBY', KEYS[1], '__total', wanted)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
return 1
`;

/** How long the new-account check may take before sending goes ahead without it. */
const NEW_SENDER_CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function isLimitExceeded(current: number, limit: number): boolean {
  if (limit === -1) return false; // unlimited
  return current >= limit;
}

function getActivePlan(team: { plan: Plan; isActive: boolean }): Plan {
  return team.isActive ? team.plan : "FREE";
}

export class LimitService {
  /** True when every recipient is a member of the team (a test send to themselves). */
  static async onlyToTeamMembers(teamId: number, recipients: string[]) {
    if (recipients.length === 0) return false;
    const members = await db.teamUser.findMany({
      where: { teamId },
      select: { user: { select: { email: true } } },
    });
    const memberEmails = new Set(
      members
        .map((member) => member.user.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    );
    return recipients.every((to) => memberEmails.has(to.trim().toLowerCase()));
  }

  static async checkDomainLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    // Limits only apply in cloud mode
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const team = await TeamService.getTeamCached(teamId);
    const currentCount = await db.domain.count({ where: { teamId } });

    const limit = PLAN_LIMITS[getActivePlan(team)].domains;
    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.DOMAIN,
      };
    }

    return {
      isLimitReached: false,
      limit,
    };
  }

  static async checkContactBookLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    // Limits only apply in cloud mode
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const team = await TeamService.getTeamCached(teamId);
    const currentCount = await db.contactBook.count({ where: { teamId } });

    const limit = PLAN_LIMITS[getActivePlan(team)].contactBooks;
    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.CONTACT_BOOK,
      };
    }

    return {
      isLimitReached: false,
      limit,
    };
  }

  static async checkTeamMemberLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    // Limits only apply in cloud mode
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const team = await TeamService.getTeamCached(teamId);
    const currentCount = await db.teamUser.count({ where: { teamId } });

    const limit = PLAN_LIMITS[getActivePlan(team)].teamMembers;
    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.TEAM_MEMBER,
      };
    }

    return {
      isLimitReached: false,
      limit,
    };
  }

  static async checkWebhookLimit(teamId: number): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
  }> {
    // Limits only apply in cloud mode
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    const team = await TeamService.getTeamCached(teamId);
    const currentCount = await db.webhook.count({
      where: { teamId },
    });

    const limit = PLAN_LIMITS[getActivePlan(team)].webhooks;
    if (isLimitExceeded(currentCount, limit)) {
      return {
        isLimitReached: true,
        limit,
        reason: LimitReason.WEBHOOK,
      };
    }

    return {
      isLimitReached: false,
      limit,
    };
  }

  // Checks email sending limits and also triggers usage notifications.
  // Side effects:
  // - Sends "warning" emails when nearing daily/monthly limits (rate-limited in TeamService)
  // - Sends "limit reached" notifications when limits are exceeded (rate-limited in TeamService)
  // - Teams with inactive subscriptions are treated like FREE plans for monthly limit alerts
  /**
   * The new-account limit for a team in its first 14 days, or null when it
   * doesn't apply (older or grandfathered teams, custom limits). Lifetime
   * bounce/complaint counts move slowly, so they're cached briefly.
   */
  static async newSenderLimit(team: {
    id: number;
    createdAt?: Date | string | null;
    dailyEmailLimit: number;
  }): Promise<number | null> {
    // Cheap check first: older teams and custom limits never query anything.
    if (
      newSenderDailyLimit(team, { sent: 0, hardBounced: 0, complained: 0 }) ===
      null
    ) {
      return null;
    }
    const counts = await withCache(
      `newsender:counts:${team.id}`,
      async () => {
        const usage = await db.dailyEmailUsage.aggregate({
          where: { teamId: team.id },
          _sum: { sent: true, hardBounced: true, complained: true },
        });
        return {
          sent: usage._sum.sent ?? 0,
          hardBounced: usage._sum.hardBounced ?? 0,
          complained: usage._sum.complained ?? 0,
        };
      },
      { ttlSeconds: 300 },
    );
    return newSenderDailyLimit(team, counts);
  }

  /**
   * Atomically claims today's (UTC) allowance for this email's recipients
   * (to + cc + bcc: the cap counts people emailed, like the `sent` counter).
   * A retry of the same email reuses its claim. Returns false when it would
   * go over the day's limit.
   */
  static async reserveNewSenderSlot(
    teamId: number,
    emailId: string,
    recipients: number,
    limit: number,
    /** The UTC day the check started, so a slow call can't spill into tomorrow. */
    day: string,
  ) {
    const claimed = await getRedis().eval(
      RESERVE_SLOT,
      1,
      redisKey(`newsender:recipients:${teamId}:${day}`),
      emailId,
      String(Math.max(1, recipients)),
      String(limit),
      String(2 * 24 * 60 * 60),
    );
    return Number(claimed) === 1;
  }

  /** Tells the team once a day that it reached its new-account limit. */
  static async notifyNewSenderLimit(
    teamId: number,
    teamName: string,
    limit: number,
    day: string,
  ) {
    try {
      // Once per UTC day, so a notice just before midnight doesn't hide tomorrow's.
      const acquired = await getRedis().set(
        redisKey(`limit:notify:${teamId}:NEW_SENDER:${day}`),
        "1",
        "EX",
        24 * 60 * 60,
        "NX",
      );
      if (acquired !== "OK") return;
      const message = newSenderLimitEmail({
        teamName,
        limit,
        settingsUrl: `${env.NEXTAUTH_URL}/settings`,
      });
      await emailTeam(teamId, message.subject, message.text);
    } catch (error) {
      logger.warn(
        { err: error, teamId },
        "[LimitService]: New-sender limit notice failed",
      );
    }
  }

  static async checkEmailLimit(
    teamId: number,
    recipients: string[] = [],
    /** The email about to be sent and its recipient count (to + cc + bcc); needed for the new-account limit. */
    email?: { id: string; recipients: number },
  ): Promise<{
    isLimitReached: boolean;
    limit: number;
    reason?: LimitReason;
    available?: number;
  }> {
    // Limits only apply in cloud mode
    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      return { isLimitReached: false, limit: -1 };
    }

    // The UTC day this check started; the new-account limit counts against it.
    const sendDay = new Date().toISOString().slice(0, 10);
    const team = await TeamService.getTeamCached(teamId);

    // In cloud, enforce verification and block flags first
    if (team.isBlocked) {
      return {
        isLimitReached: true,
        limit: 0,
        reason: LimitReason.EMAIL_BLOCKED,
      };
    }

    // Paused by the sending rules (or an admin) until someone resumes it.
    if (team.sendingPausedAt) {
      return {
        isLimitReached: true,
        limit: 0,
        reason: LimitReason.EMAIL_SENDING_PAUSED,
      };
    }

    // Teams created after paid-only signups need to pay to send, except test
    // emails to their own members. Strict `=== false` so a team cached before
    // this field existed isn't caught.
    if (
      getActivePlan(team) === "FREE" &&
      team.freePlanAllowed === false &&
      !(await LimitService.onlyToTeamMembers(teamId, recipients))
    ) {
      return {
        isLimitReached: true,
        limit: 0,
        reason: LimitReason.EMAIL_PLAN_REQUIRED,
      };
    }

    // Enforce daily sending limit (team-specific)
    const usage = await withCache(
      `usage:this-month:${teamId}`,
      () => getThisMonthUsage(teamId),
      { ttlSeconds: 60 },
    );

    const dailyUsage = usage.day.reduce((acc, curr) => acc + curr.sent, 0);
    const activePlan = getActivePlan(team);
    const dailyLimit =
      activePlan !== "FREE"
        ? team.dailyEmailLimit
        : PLAN_LIMITS.FREE.emailsPerDay;

    logger.info(
      { dailyUsage, dailyLimit, team },
      `[LimitService]: Daily usage and limit`,
    );

    // A paid team in its first 14 days starts with a lower daily limit that
    // grows with clean sending, so a list can't be blasted on day one.
    // If the check itself fails, sending carries on as before (logged).
    if (activePlan !== "FREE" && email) {
      let rampLimit: number | null = null;
      let allowed = true;
      try {
        // Bounded: a hung Redis or DB call mustn't hold a queue worker.
        const result = await withTimeout(
          (async () => {
            const limit = await LimitService.newSenderLimit(team);
            if (limit === null) return { limit, allowed: true };
            const ok = await LimitService.reserveNewSenderSlot(
              teamId,
              email.id,
              email.recipients,
              Math.min(limit, dailyLimit),
              sendDay,
            );
            return { limit, allowed: ok };
          })(),
          NEW_SENDER_CHECK_TIMEOUT_MS,
        );
        rampLimit = result.limit;
        allowed = result.allowed;
      } catch (error) {
        rampLimit = null;
        allowed = true;
        logger.error(
          { err: error, teamId },
          "[LimitService]: New-account limit check failed; not applied",
        );
      }
      if (rampLimit !== null && !allowed) {
        // In the background: a slow notice mustn't hold a queue worker.
        void LimitService.notifyNewSenderLimit(
          teamId,
          team.name,
          rampLimit,
          sendDay,
        );
        return {
          isLimitReached: true,
          limit: rampLimit,
          reason: LimitReason.EMAIL_DAILY_LIMIT_REACHED,
          available: 0,
        };
      }
    }

    if (isLimitExceeded(dailyUsage, dailyLimit)) {
      // Notify: daily limit reached
      try {
        await TeamService.maybeNotifyEmailLimitReached(
          teamId,
          dailyLimit,
          LimitReason.EMAIL_DAILY_LIMIT_REACHED,
        );
      } catch (e) {
        logger.warn(
          { err: e },
          "Failed to send daily limit reached notification",
        );
      }

      return {
        isLimitReached: true,
        limit: dailyLimit,
        reason: LimitReason.EMAIL_DAILY_LIMIT_REACHED,
        available: dailyLimit - dailyUsage,
      };
    }

    // Apply monthly limit logic for FREE plan or inactive subscriptions
    if (getActivePlan(team) === "FREE") {
      const monthlyUsage = usage.month.reduce(
        (acc, curr) => acc + curr.sent,
        0,
      );
      // Use FREE plan limits for inactive subscriptions
      const monthlyLimit = PLAN_LIMITS.FREE.emailsPerMonth;

      logger.info(
        { monthlyUsage, monthlyLimit, team, isActive: team.isActive },
        `[LimitService]: Monthly usage and limit (FREE plan or inactive subscription)`,
      );

      if (monthlyUsage / monthlyLimit > 0.8 && monthlyUsage < monthlyLimit) {
        await TeamService.sendWarningEmail(
          teamId,
          monthlyUsage,
          monthlyLimit,
          LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED,
        );
      }

      logger.info(
        { monthlyUsage, monthlyLimit, team, isActive: team.isActive },
        `[LimitService]: Monthly usage and limit (FREE plan or inactive subscription)`,
      );

      if (isLimitExceeded(monthlyUsage, monthlyLimit)) {
        // Notify: monthly (free plan or inactive subscription) limit reached
        try {
          await TeamService.maybeNotifyEmailLimitReached(
            teamId,
            monthlyLimit,
            LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED,
          );
        } catch (e) {
          logger.warn(
            { err: e },
            "Failed to send monthly limit reached notification",
          );
        }

        return {
          isLimitReached: true,
          limit: monthlyLimit,
          reason: LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED,
          available: monthlyLimit - monthlyUsage,
        };
      }
    }

    // Warn: nearing daily limit (e.g., < 20% available)
    if (
      dailyLimit !== -1 &&
      dailyLimit > 0 &&
      dailyLimit - dailyUsage > 0 &&
      (dailyLimit - dailyUsage) / dailyLimit < 0.2
    ) {
      try {
        await TeamService.sendWarningEmail(
          teamId,
          dailyUsage,
          dailyLimit,
          LimitReason.EMAIL_DAILY_LIMIT_REACHED,
        );
      } catch (e) {
        logger.warn({ err: e }, "Failed to send daily warning email");
      }
    }

    return {
      isLimitReached: false,
      limit: dailyLimit,
      available: dailyLimit - dailyUsage,
    };
  }
}
