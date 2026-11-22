import { createHash } from "crypto";
import { WaitlistStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import { TeamService } from "~/server/service/team-service";

/**
 * What the Guard (our separate review service) can read and do, through the
 * internal admin API. It reads applications, campaigns, new teams and their
 * emails; it can approve or stop a campaign, log an alert, and pause a team.
 * It can never block a team or delete anything.
 *
 * New teams' campaigns wait for the Guard's check before sending, but only
 * for REVIEW_HOLD_MINUTES: if the Guard is down, they send anyway.
 */

/** A team counts as new, and is watched closely, for this many days. */
export const WATCH_DAYS = 14;
/** How long a new team's campaign waits for the Guard before sending anyway. */
export const REVIEW_HOLD_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_HTML_MAX = 200_000;
const EMAIL_TEXT_MAX = 4_000;

export const GUARD_ACTOR = "guard";

export class GuardNotFoundError extends Error {}
export class GuardConflictError extends Error {}

/** Holding new teams' campaigns is on only when explicitly enabled. */
export function reviewHoldEnabled() {
  return env.NEXT_PUBLIC_IS_CLOUD && env.GUARD_REVIEW_NEW_TEAMS === "true";
}

function watchStart(now = Date.now()) {
  return new Date(now - WATCH_DAYS * DAY_MS);
}

/**
 * When a campaign of this team should stop waiting for the Guard, or null if
 * it doesn't wait (hold off, or the team is past its watch period).
 */
export async function reviewHoldFor(
  teamId: number,
  client: Pick<typeof db, "team"> = db,
): Promise<Date | null> {
  if (!reviewHoldEnabled()) return null;
  const team = await client.team.findUnique({
    where: { id: teamId },
    select: { createdAt: true },
  });
  if (!team || team.createdAt < watchStart()) return null;
  return new Date(Date.now() + REVIEW_HOLD_MINUTES * 60 * 1000);
}

/** Whether a campaign is still waiting for the Guard's check. */
export function isReviewHeld(
  campaign: { reviewHoldUntil: Date | null },
  now = Date.now(),
) {
  return Boolean(
    campaign.reviewHoldUntil && campaign.reviewHoldUntil.getTime() > now,
  );
}

/**
 * A campaign the Guard stopped stays stopped until it's approved (by you,
 * through the Guard), which logs a RESUME for that campaign.
 */
export async function stoppedByGuard(teamId: number, campaignId: string) {
  const stop = await db.teamAction.findFirst({
    where: {
      teamId,
      actor: GUARD_ACTOR,
      action: "PAUSE",
      details: { path: ["campaignId"], equals: campaignId },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!stop) return false;
  const release = await db.teamAction.findFirst({
    where: {
      teamId,
      action: "RESUME",
      details: { path: ["campaignId"], equals: campaignId },
      createdAt: { gt: stop.createdAt },
    },
    select: { id: true },
  });
  return !release;
}

function contentHash(parts: Array<string | null | undefined>) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(`${part ?? ""}\u0000`);
  return hash.digest("hex").slice(0, 16);
}

function truncate(value: string | null, max: number) {
  if (!value) return value;
  return value.length > max ? value.slice(0, max) : value;
}

// --- Waitlist applications ---

export const applicationsQuery = z.object({
  status: z.nativeEnum(WaitlistStatus).default("PENDING"),
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listApplications(
  query: z.infer<typeof applicationsQuery>,
) {
  const items = await db.waitlistApplication.findMany({
    where: {
      status: query.status,
      ...(query.since ? { createdAt: { gt: query.since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: query.limit,
    select: {
      id: true,
      userId: true,
      email: true,
      website: true,
      domain: true,
      emailTypes: true,
      emailVolume: true,
      listSource: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });
  return { items };
}

// --- Campaigns ---

/**
 * Campaigns that are sending or about to, plus ones still waiting for review.
 * `contentHash` changes when the content does, so the Guard can re-check an
 * edited campaign.
 */
export async function listActiveCampaigns() {
  const campaigns = await db.campaign.findMany({
    where: {
      OR: [
        { status: { in: ["SCHEDULED", "RUNNING"] } },
        { reviewHoldUntil: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      status: true,
      from: true,
      replyTo: true,
      subject: true,
      previewText: true,
      html: true,
      total: true,
      sent: true,
      scheduledAt: true,
      reviewHoldUntil: true,
      createdAt: true,
      team: { select: { id: true, name: true, createdAt: true } },
    },
  });

  const since = watchStart();
  return {
    items: campaigns.map(({ html, team, ...campaign }) => ({
      ...campaign,
      html: truncate(html, CAMPAIGN_HTML_MAX),
      contentHash: contentHash([
        campaign.from,
        campaign.subject,
        campaign.previewText,
        html,
      ]),
      waitingForReview: isReviewHeld(campaign),
      team: { ...team, isNew: team.createdAt >= since },
    })),
  };
}

export const reviewBody = z.object({
  decision: z.enum(["approve", "stop"]),
  reason: z.string().trim().min(1).max(2_000),
});

/**
 * approve: lets a waiting campaign send now, or restarts one the Guard
 * stopped (logged as a RESUME).
 * stop: pauses the campaign and logs it; it stays stopped until approved.
 * Works on any campaign that is sending or about to.
 */
export async function reviewCampaign(
  campaignId: string,
  body: z.infer<typeof reviewBody>,
) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, teamId: true, status: true, name: true },
  });
  if (!campaign) throw new GuardNotFoundError("Campaign not found");

  if (body.decision === "approve") {
    if (
      campaign.status === "PAUSED" &&
      (await stoppedByGuard(campaign.teamId, campaignId))
    ) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${campaign.teamId} FOR UPDATE`;
        const team = await tx.team.findUnique({
          where: { id: campaign.teamId },
          select: { isBlocked: true, sendingPausedAt: true },
        });
        if (team?.isBlocked || team?.sendingPausedAt) {
          throw new GuardConflictError(
            "The team is paused or blocked; resume the team first",
          );
        }
        await tx.campaign.update({
          where: { id: campaignId },
          data: { status: "SCHEDULED", reviewHoldUntil: null },
        });
        await tx.teamAction.create({
          data: {
            teamId: campaign.teamId,
            action: "RESUME",
            actor: GUARD_ACTOR,
            reason: `Approved campaign "${campaign.name}": ${body.reason}`,
            details: { scope: "campaign", campaignId },
          },
        });
      });
      return { ok: true, status: "SCHEDULED" };
    }
    await db.campaign.update({
      where: { id: campaignId },
      data: { reviewHoldUntil: null },
    });
    return { ok: true, status: campaign.status };
  }

  const stopped = await db.$transaction(async (tx) => {
    // The same Team lock that pausing, blocking and resuming take.
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${campaign.teamId} FOR UPDATE`;
    const { count } = await tx.campaign.updateMany({
      where: { id: campaignId, status: { in: ["SCHEDULED", "RUNNING"] } },
      data: { status: "PAUSED", reviewHoldUntil: null },
    });
    if (count === 0) return false;
    await tx.teamAction.create({
      data: {
        teamId: campaign.teamId,
        action: "PAUSE",
        actor: GUARD_ACTOR,
        reason: `Stopped campaign "${campaign.name}": ${body.reason}`,
        details: { scope: "campaign", campaignId },
      },
    });
    return true;
  });
  if (!stopped) {
    throw new GuardConflictError(
      `Campaign is ${campaign.status.toLowerCase()}, not sending`,
    );
  }
  return { ok: true, status: "PAUSED" };
}

// --- New teams ---

export const watchQuery = z.object({
  days: z.coerce.number().int().min(1).max(60).default(WATCH_DAYS),
});

/** Teams created in the last `days`, with their sending numbers. */
export async function listWatchedTeams(query: z.infer<typeof watchQuery>) {
  const since = new Date(Date.now() - query.days * DAY_MS);
  const teams = await db.team.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      createdAt: true,
      plan: true,
      isActive: true,
      isBlocked: true,
      sendingPausedAt: true,
      domains: { select: { name: true, status: true } },
      teamUsers: {
        select: {
          role: true,
          user: {
            select: {
              email: true,
              waitlistApplication: {
                select: { website: true, description: true },
              },
            },
          },
        },
      },
    },
  });
  if (teams.length === 0) return { items: [] };

  const usage = await db.dailyEmailUsage.groupBy({
    by: ["teamId"],
    where: {
      teamId: { in: teams.map((team) => team.id) },
      date: { gte: since.toISOString().slice(0, 10) },
    },
    _sum: {
      sent: true,
      delivered: true,
      hardBounced: true,
      bounced: true,
      complained: true,
    },
  });
  const usageByTeam = new Map(usage.map((row) => [row.teamId, row._sum]));

  return {
    items: teams.map(({ teamUsers, ...team }) => {
      const sums = usageByTeam.get(team.id);
      return {
        ...team,
        members: teamUsers.map(({ role, user }) => ({
          role,
          email: user.email,
          website: user.waitlistApplication?.website ?? null,
          description: user.waitlistApplication?.description ?? null,
        })),
        usage: {
          sent: sums?.sent ?? 0,
          delivered: sums?.delivered ?? 0,
          bounced: sums?.bounced ?? 0,
          hardBounced: sums?.hardBounced ?? 0,
          complained: sums?.complained ?? 0,
        },
      };
    }),
  };
}

export const emailsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  since: z.coerce.date().optional(),
});

/**
 * A team's latest emails, for a content check. Recipients are reduced to
 * their domain: the Guard needs the content, not who it went to.
 */
export async function sampleTeamEmails(
  teamId: number,
  query: z.infer<typeof emailsQuery>,
) {
  const emails = await db.email.findMany({
    where: {
      teamId,
      ...(query.since ? { createdAt: { gt: query.since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
    select: {
      id: true,
      createdAt: true,
      from: true,
      to: true,
      subject: true,
      text: true,
      html: true,
      latestStatus: true,
      campaignId: true,
    },
  });
  return {
    items: emails.map(({ to, text, html, ...email }) => ({
      ...email,
      toDomains: [
        ...new Set(to.map((address) => address.split("@")[1] ?? "")),
      ].filter(Boolean),
      text: truncate(text, EMAIL_TEXT_MAX),
      html: text ? null : truncate(html, EMAIL_TEXT_MAX),
    })),
  };
}

export const teamActionBody = z.object({
  action: z.enum(["ALERT", "PAUSE"]),
  reason: z.string().trim().min(1).max(2_000),
  details: z.record(z.unknown()).optional(),
});

/**
 * ALERT only logs. PAUSE stops the team's sending and its campaigns, like an
 * admin pause; an admin resumes it. The Guard can't block or resume.
 */
export async function recordTeamAction(
  teamId: number,
  body: z.infer<typeof teamActionBody>,
) {
  const details = body.details as Prisma.InputJsonValue | undefined;

  if (body.action === "ALERT") {
    const team = await db.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) throw new GuardNotFoundError("Team not found");
    await db.teamAction.create({
      data: {
        teamId,
        action: "ALERT",
        actor: GUARD_ACTOR,
        reason: body.reason,
        details,
      },
    });
    return { ok: true, changed: false };
  }

  const changed = await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{ id: number }>
    >`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
    if (locked.length === 0) throw new GuardNotFoundError("Team not found");

    const { count } = await tx.team.updateMany({
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
        action: "PAUSE",
        actor: GUARD_ACTOR,
        reason: body.reason,
        details,
      },
    });
    return true;
  });

  if (changed) {
    try {
      await TeamService.refreshTeamCache(teamId);
    } catch (error) {
      // The cache expires within 2 minutes anyway.
      logger.error({ err: error, teamId }, "[Guard]: Cache refresh failed");
    }
  }
  return { ok: true, changed };
}
