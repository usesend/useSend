import { PLAN_LIMITS, LimitReason } from "~/lib/constants/plans";
import { env } from "~/env";
import { getThisMonthUsage } from "./usage-service";
import { TeamService } from "./team-service";
import { withCache } from "../redis";
import { db } from "../db";
import { logger } from "../logger/log";
import { Plan } from "@prisma/client";

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
    // Recipients may carry a display name: "Sam <sam@acme.com>".
    const address = (recipient: string) =>
      (recipient.match(/<([^>]+)>/)?.[1] ?? recipient).trim().toLowerCase();
    return recipients.every((recipient) =>
      memberEmails.has(address(recipient)),
    );
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
  static async checkEmailLimit(
    teamId: number,
    recipients: string[] = [],
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

    const team = await TeamService.getTeamCached(teamId);

    // In cloud, enforce verification and block flags first
    if (team.isBlocked) {
      return {
        isLimitReached: true,
        limit: 0,
        reason: LimitReason.EMAIL_BLOCKED,
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
