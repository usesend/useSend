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

type Client = Prisma.TransactionClient | typeof db;

/**
 * The last time an admin resumed or unblocked the team, and which of its
 * campaigns hadn't sent anything yet at that moment.
 */
type Reset = {
  id: string;
  createdAt: Date;
  unsentCampaignIds: string[];
} | null;

async function lastReset(teamId: number, client: Client = db): Promise<Reset> {
  const reset = await client.teamAction.findFirst({
    where: { teamId, action: { in: ["RESUME", "UNBLOCK"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, details: true },
  });
  if (!reset) return null;
  const details = reset.details as { unsentCampaignIds?: string[] } | null;
  return {
    id: reset.id,
    createdAt: reset.createdAt,
    unsentCampaignIds: details?.unsentCampaignIds ?? [],
  };
}

/**
 * Stored on an admin resume or unblock. Campaigns that had already sent are
 * not judged on their totals again (late bounces from before the reset would
 * otherwise count against no new sends); the team's rolling window still
 * covers them. Campaigns that hadn't sent yet are judged in full.
 */
export async function unsentCampaignIds(
  client: Client,
  teamId: number,
): Promise<string[]> {
  const campaigns = await client.campaign.findMany({
    where: { teamId, sent: 0, status: { not: "SENT" } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  return campaigns.map((campaign) => campaign.id);
}

/**
 * Locks the team row and confirms no admin reset happened since this check
 * started, so a check computed before an unblock can't re-block on old counts.
 * The admin settings update takes the same lock.
 */
async function resetUnchanged(
  tx: Prisma.TransactionClient,
  teamId: number,
  seen: Reset,
) {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
  const latest = await lastReset(teamId, tx);
  return (latest?.id ?? null) === (seen?.id ?? null);
}

/** Notices shouldn't hold up SES event processing, or fail it. */
function inBackground(task: Promise<unknown>, what: string) {
  void task.catch((error: unknown) =>
    logger.error({ err: error }, `[SendingRules]: ${what} failed`),
  );
}

/**
 * First day counted, `days` back including today. After an admin resumes or
 * unblocks a team, days up to and including that day no longer count.
 */
function windowStart(days: number, reset: Reset) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  let from = toDateString(start);

  if (reset) {
    const dayAfter = new Date(reset.createdAt);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    const resetFrom = toDateString(dayAfter);
    if (resetFrom > from) from = resetFrom;
  }

  return from;
}

/** Sends never count as fewer than the emails we know were delivered or bounced. */
function sendsOf(counts: {
  sent?: number | null;
  delivered?: number | null;
  bounced?: number | null;
}) {
  return Math.max(
    counts.sent ?? 0,
    (counts.delivered ?? 0) + (counts.bounced ?? 0),
  );
}

/**
 * Bounces and complaints from the last 7 days, against sends from the last
 * 10: complaints often arrive days after the email went out, so a team that
 * stopped sending isn't judged on late complaints against too few sends.
 */
async function teamCounts(
  teamId: number,
  reset: Reset,
): Promise<SendingCounts> {
  const [outcomes, sends] = await Promise.all([
    db.dailyEmailUsage.aggregate({
      where: {
        teamId,
        date: { gte: windowStart(SENDING_RULES.windowDays, reset) },
      },
      _sum: { hardBounced: true, complained: true },
    }),
    db.dailyEmailUsage.aggregate({
      where: {
        teamId,
        date: { gte: windowStart(SENDING_RULES.sendWindowDays, reset) },
      },
      _sum: { sent: true, delivered: true, bounced: true },
    }),
  ]);
  return {
    sent: sendsOf(sends._sum),
    hardBounced: outcomes._sum.hardBounced ?? 0,
    complained: outcomes._sum.complained ?? 0,
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

  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendMail(to, subject, text, toPlainHtml(text), "hey@usesend.com"),
    ),
  );
  results.forEach((result) => {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason, teamId },
        "[SendingRules]: Team email failed",
      );
    }
  });
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
  reset: Reset,
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
    if (!(await resetUnchanged(tx, teamId, reset))) return false;

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

async function checkCampaign(teamId: number, campaignId: string, reset: Reset) {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, teamId },
    select: {
      id: true,
      name: true,
      sent: true,
      delivered: true,
      bounced: true,
      hardBounced: true,
      complained: true,
      createdAt: true,
    },
  });
  if (!campaign) return;

  // After an admin resume or unblock, campaigns that had already sent aren't
  // judged on their totals again; the team's rolling window still applies.
  if (
    reset &&
    campaign.createdAt < reset.createdAt &&
    !reset.unsentCampaignIds.includes(campaign.id)
  ) {
    return;
  }

  const verdict = judgeCounts({
    sent: sendsOf(campaign),
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
      reset,
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
    if (!(await resetUnchanged(tx, teamId, reset))) return false;

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
 * the team or campaign when its rates cross the limits, emails the team and
 * posts to Discord. SENDING_RULES_MODE "alert" only posts; "off" disables it.
 */
export async function checkSendingHealth(params: {
  teamId: number;
  campaignId?: string | null;
  spamTrap?: boolean;
}) {
  if (!env.NEXT_PUBLIC_IS_CLOUD || env.SENDING_RULES_MODE === "off") return;

  const { teamId, campaignId } = params;
  const reset = await lastReset(teamId);

  if (params.spamTrap) {
    await actOnTeam(
      teamId,
      {
        level: "block",
        reason:
          "an email reached a spam trap, an address found only on bought, scraped or old lists",
      },
      { scope: "spamTrap", campaignId: campaignId ?? null },
      reset,
    );
    return;
  }

  if (campaignId) {
    await checkCampaign(teamId, campaignId, reset);
  }

  const counts = await teamCounts(teamId, reset);
  const verdict = judgeCounts(counts);
  if (verdict.level !== "ok") {
    await actOnTeam(teamId, verdict, { scope: "team", ...counts }, reset);
  }
}
