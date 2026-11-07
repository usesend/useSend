import type { Prisma, TeamActionType } from "@prisma/client";
import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { sendMail } from "~/server/mailer";
import { getRedis, redisKey } from "~/server/redis";
import { toPlainHtml } from "~/server/utils/email-content";
import { sendToDiscord } from "./notification-service";
import { TeamService } from "./team-service";
import {
  judgeCounts,
  SENDING_RULES,
  type SendingCounts,
  type Verdict,
} from "./sending-rules";

export { isSpamTrapBounce, judgeCounts, SENDING_RULES } from "./sending-rules";

const ALERT_COOLDOWN_SECONDS = 24 * 60 * 60;

function toDateString(date: Date) {
  return date.toISOString().split("T")[0] as string;
}

/** When an admin last resumed or unblocked the team, if ever. */
async function lastResetAt(teamId: number) {
  const reset = await db.teamAction.findFirst({
    where: { teamId, action: { in: ["RESUME", "UNBLOCK"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return reset?.createdAt ?? null;
}

/** Notices shouldn't hold up SES event processing, or fail it. */
function inBackground(task: Promise<unknown>, what: string) {
  void task.catch((error: unknown) =>
    logger.error({ err: error }, `[SendingRules]: ${what} failed`),
  );
}

/**
 * First day counted for the team's rolling window. After an admin resumes or
 * unblocks a team, days up to and including that day no longer count.
 */
async function windowStart(teamId: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (SENDING_RULES.windowDays - 1));
  let from = toDateString(start);

  const lastReset = await lastResetAt(teamId);

  if (lastReset) {
    const dayAfter = new Date(lastReset);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    const resetFrom = toDateString(dayAfter);
    if (resetFrom > from) from = resetFrom;
  }

  return from;
}

async function teamCounts(teamId: number): Promise<SendingCounts> {
  const from = await windowStart(teamId);
  const result = await db.dailyEmailUsage.aggregate({
    where: { teamId, date: { gte: from } },
    _sum: { sent: true, hardBounced: true, complained: true },
  });
  return {
    sent: result._sum.sent ?? 0,
    hardBounced: result._sum.hardBounced ?? 0,
    complained: result._sum.complained ?? 0,
  };
}

async function recordAction(
  teamId: number,
  action: TeamActionType,
  reason: string,
  details?: Prisma.InputJsonValue,
) {
  await db.teamAction.create({
    data: { teamId, action, actor: "rules", reason, details },
  });
}

/** One alert per key per day, so a burst of bounces posts once. */
async function claimAlert(key: string) {
  const acquired = await getRedis().set(
    redisKey(`sending-rules:alert:${key}`),
    "1",
    "EX",
    ALERT_COOLDOWN_SECONDS,
    "NX",
  );
  return acquired === "OK";
}

async function teamLabel(teamId: number) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { name: true },
  });
  return `${team?.name ?? "Unknown team"} (#${teamId})`;
}

async function emailTeam(teamId: number, subject: string, text: string) {
  const teamUsers = await TeamService.getTeamUsers(teamId);
  const recipients = teamUsers
    .map((teamUser) => teamUser.user?.email)
    .filter((email): email is string => Boolean(email));

  await Promise.allSettled(
    recipients.map((to) =>
      sendMail(to, subject, text, toPlainHtml(text), "hey@usesend.com"),
    ),
  );
}

async function notify(message: string) {
  try {
    await sendToDiscord(message);
  } catch (error) {
    logger.error({ err: error }, "[SendingRules]: Discord alert failed");
  }
}

async function actOnTeam(
  teamId: number,
  verdict: Exclude<Verdict, { level: "ok" }>,
  details: Prisma.InputJsonValue,
) {
  const label = await teamLabel(teamId);

  if (env.SENDING_RULES_MODE === "alert") {
    if (!(await claimAlert(`team:${teamId}:${verdict.level}`))) return;
    await recordAction(
      teamId,
      "ALERT",
      `Would ${verdict.level}: ${verdict.reason}`,
      details,
    );
    inBackground(
      notify(`[alert only] Would ${verdict.level} ${label}: ${verdict.reason}`),
      "Discord alert",
    );
    return;
  }

  // Conditional updates make this safe when many events arrive at once:
  // only the first one changes the team and sends the notices.
  const acted = await db.$transaction(async (tx) => {
    const { count } =
      verdict.level === "block"
        ? await tx.team.updateMany({
            where: { id: teamId, isBlocked: false },
            data: { isBlocked: true },
          })
        : await tx.team.updateMany({
            where: { id: teamId, isBlocked: false, sendingPausedAt: null },
            data: { sendingPausedAt: new Date() },
          });
    if (count === 0) return false;

    await tx.campaign.updateMany({
      where: { teamId, status: { in: ["RUNNING", "SCHEDULED"] } },
      data: { status: "PAUSED" },
    });
    await tx.teamAction.create({
      data: {
        teamId,
        action: verdict.level === "block" ? "BLOCK" : "PAUSE",
        actor: "rules",
        reason: verdict.reason,
        details,
      },
    });
    return true;
  });
  if (!acted) return;

  try {
    await TeamService.refreshTeamCache(teamId);
  } catch (error) {
    // The cache expires within 2 minutes anyway.
    logger.error(
      { err: error, teamId },
      "[SendingRules]: Cache refresh failed",
    );
  }

  const name = label.replace(/ \(#\d+\)$/, "");

  if (verdict.level === "block") {
    inBackground(
      notify(`Blocked ${label}: ${verdict.reason}`),
      "Discord alert",
    );
    inBackground(
      emailTeam(
        teamId,
        "useSend: sending is blocked on your account",
        `Hi ${name} team,\n\nWe've blocked sending on your useSend account because ${verdict.reason}.\n\nEmails won't go out until we've reviewed the account with you. Reply to this email to talk to us.\n\nuseSend`,
      ),
      "Team email",
    );
  } else {
    inBackground(notify(`Paused ${label}: ${verdict.reason}`), "Discord alert");
    inBackground(
      emailTeam(
        teamId,
        "useSend: we paused sending on your account",
        `Hi ${name} team,\n\nWe paused sending on your useSend account because ${verdict.reason} over the last ${SENDING_RULES.windowDays} days.\n\nThis usually means some addresses on your list are old, mistyped, or never signed up to hear from you. Please remove them, then reply to this email and we'll turn sending back on.\n\nWhile sending is paused, new emails fail instead of going out.\n\nuseSend`,
      ),
      "Team email",
    );
  }
}

async function checkCampaign(teamId: number, campaignId: string) {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, teamId },
    select: {
      id: true,
      name: true,
      sent: true,
      hardBounced: true,
      complained: true,
      createdAt: true,
    },
  });
  if (!campaign) return;

  // After an admin resumes or unblocks the team, older campaigns' totals
  // don't count again; the team's rolling window still applies.
  const lastReset = await lastResetAt(teamId);
  if (lastReset && campaign.createdAt < lastReset) return;

  const verdict = judgeCounts({
    sent: campaign.sent,
    hardBounced: campaign.hardBounced,
    complained: campaign.complained,
  });
  if (verdict.level === "ok") return;

  const details = { scope: "campaign", campaignId: campaign.id };

  if (verdict.level === "block") {
    await actOnTeam(
      teamId,
      {
        level: "block",
        reason: `${verdict.reason} on campaign "${campaign.name}"`,
      },
      details,
    );
    return;
  }

  // Once a campaign was paused and its owner resumed it, they've accepted the
  // risk: only the block level stops it again.
  const pausedBefore = await db.teamAction.findFirst({
    where: {
      teamId,
      action: env.SENDING_RULES_MODE === "alert" ? "ALERT" : "PAUSE",
      details: { path: ["campaignId"], equals: campaign.id },
    },
    select: { id: true },
  });
  if (pausedBefore) return;

  const label = await teamLabel(teamId);

  if (env.SENDING_RULES_MODE === "alert") {
    if (!(await claimAlert(`campaign:${campaign.id}`))) return;
    await recordAction(
      teamId,
      "ALERT",
      `Would pause campaign "${campaign.name}": ${verdict.reason}`,
      details,
    );
    inBackground(
      notify(
        `[alert only] Would pause campaign "${campaign.name}" of ${label}: ${verdict.reason}`,
      ),
      "Discord alert",
    );
    return;
  }

  const acted = await db.$transaction(async (tx) => {
    const { count } = await tx.campaign.updateMany({
      where: { id: campaign.id, status: { in: ["RUNNING", "SCHEDULED"] } },
      data: { status: "PAUSED" },
    });
    if (count === 0) return false;
    await tx.teamAction.create({
      data: {
        teamId,
        action: "PAUSE",
        actor: "rules",
        reason: `Paused campaign "${campaign.name}": ${verdict.reason}`,
        details,
      },
    });
    return true;
  });
  if (!acted) return;

  inBackground(
    notify(`Paused campaign "${campaign.name}" of ${label}: ${verdict.reason}`),
    "Discord alert",
  );
  inBackground(
    emailTeam(
      teamId,
      `useSend: we paused your campaign "${campaign.name}"`,
      `Hi there,\n\nWe paused your campaign "${campaign.name}" because ${verdict.reason}.\n\nPlease check where these contacts came from before you resume it. If it keeps going and gets worse, we'll have to block sending on your account.\n\nuseSend`,
    ),
    "Team email",
  );
}

/**
 * Runs after every hard bounce and complaint (cloud only). Pauses or blocks
 * the team or campaign when its rates cross the limits, or only alerts when
 * SENDING_RULES_MODE is "alert".
 */
export async function checkSendingHealth(params: {
  teamId: number;
  campaignId?: string | null;
  spamTrap?: boolean;
}) {
  if (!env.NEXT_PUBLIC_IS_CLOUD || env.SENDING_RULES_MODE === "off") return;

  const { teamId, campaignId } = params;

  if (params.spamTrap) {
    await actOnTeam(
      teamId,
      {
        level: "block",
        reason:
          "an email reached a spam trap, an address found only on bought, scraped or old lists",
      },
      { scope: "spamTrap", campaignId: campaignId ?? null },
    );
    return;
  }

  if (campaignId) {
    await checkCampaign(teamId, campaignId);
  }

  const counts = await teamCounts(teamId);
  const verdict = judgeCounts(counts);
  if (verdict.level !== "ok") {
    await actOnTeam(teamId, verdict, { scope: "team", ...counts });
  }
}
