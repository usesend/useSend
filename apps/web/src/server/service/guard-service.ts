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
 * It can never block or resume a team, or delete anything.
 *
 * New teams' campaigns wait for the Guard's check before sending, but only
 * for REVIEW_HOLD_MINUTES: if the Guard is down, they send anyway.
 * Approving and stopping campaigns lives in campaign-service
 * (`guardReviewCampaign`), next to the other sending transitions.
 */

/** A team counts as new, and is watched closely, for this many days. */
export const WATCH_DAYS = 14;
/** How long a new team's campaign waits for the Guard before sending anyway. */
export const REVIEW_HOLD_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_HTML_MAX = 100_000;
const EMAIL_TEXT_MAX = 4_000;

export const GUARD_ACTOR = "guard";

export class GuardNotFoundError extends Error {}
export class GuardConflictError extends Error {}
export class GuardForbiddenError extends Error {}

/** Holding new teams' campaigns is on only when explicitly enabled. */
export function reviewHoldEnabled() {
  return env.NEXT_PUBLIC_IS_CLOUD && env.GUARD_REVIEW_NEW_TEAMS === "true";
}

function watchStart(now = Date.now()) {
  return new Date(now - WATCH_DAYS * DAY_MS);
}

export function isNewTeam(team: { createdAt: Date }) {
  return team.createdAt >= watchStart();
}

/**
 * The Guard may stop campaigns and pause teams only of new teams, unless
 * GUARD_ACTIONS is explicitly "all".
 */
export function assertGuardMayAct(team: { createdAt: Date }) {
  if (env.GUARD_ACTIONS === "all" || isNewTeam(team)) return;
  throw new GuardForbiddenError(
    "The Guard may only act on teams in their first 14 days",
  );
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
  if (!team || !isNewTeam(team)) return null;
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
 * Fingerprint of everything the Guard judges. An approval must name the
 * fingerprint it reviewed, so it can't approve content changed since.
 */
export function campaignContentHash(campaign: {
  from: string;
  replyTo: string[];
  subject: string;
  previewText: string | null;
  html: string | null;
}) {
  const hash = createHash("sha256");
  for (const part of [
    campaign.from,
    campaign.replyTo.join(","),
    campaign.subject,
    campaign.previewText,
    campaign.html,
  ]) {
    hash.update(`${part ?? ""}\u0000`);
  }
  return hash.digest("hex").slice(0, 32);
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
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

export const campaignsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10),
  cursor: z.string().min(1).optional(),
});

/**
 * Campaigns that are sending or about to, ones waiting for review, and ones
 * the Guard stopped, oldest first, a page at a time (`nextCursor`). Content
 * is read only for the campaigns on the page.
 */
export async function listActiveCampaigns(
  query: z.infer<typeof campaignsQuery>,
) {
  const rows = await db.campaign.findMany({
    where: {
      OR: [
        { status: { in: ["SCHEDULED", "RUNNING"] } },
        { reviewHoldUntil: { gt: new Date() } },
        { guardStoppedAt: { not: null } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: { id: true },
  });
  const pageIds = rows.slice(0, query.limit).map((row) => row.id);
  const nextCursor = rows.length > query.limit ? (pageIds.at(-1) ?? null) : null;
  if (pageIds.length === 0) return { items: [], nextCursor };

  const campaigns = await db.campaign.findMany({
    where: { id: { in: pageIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
      guardStoppedAt: true,
      createdAt: true,
      team: { select: { id: true, name: true, createdAt: true } },
    },
  });

  return {
    items: campaigns.map(({ html, team, ...campaign }) => ({
      ...campaign,
      html: truncate(html, CAMPAIGN_HTML_MAX),
      htmlTruncated: (html?.length ?? 0) > CAMPAIGN_HTML_MAX,
      contentHash: campaignContentHash({ ...campaign, html }),
      waitingForReview: isReviewHeld(campaign),
      team: { ...team, isNew: isNewTeam(team) },
    })),
    nextCursor,
  };
}

export const reviewBody = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    reason: z.string().trim().min(1).max(2_000),
    /** The `contentHash` the Guard reviewed. */
    contentHash: z.string().min(1).max(64),
  }),
  z.object({
    decision: z.literal("stop"),
    reason: z.string().trim().min(1).max(2_000),
  }),
]);

// --- New teams ---

export const watchQuery = z.object({
  days: z.coerce.number().int().min(1).max(60).default(WATCH_DAYS),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.coerce.number().int().positive().optional(),
});

/** Teams created in the last `days`, with their sending numbers, paged. */
export async function listWatchedTeams(query: z.infer<typeof watchQuery>) {
  const since = new Date(Date.now() - query.days * DAY_MS);
  const teams = await db.team.findMany({
    where: { createdAt: { gte: since } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
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
  const page = teams.slice(0, query.limit);
  const nextCursor =
    teams.length > query.limit ? (page.at(-1)?.id ?? null) : null;
  if (page.length === 0) return { items: [], nextCursor };

  const usage = await db.dailyEmailUsage.groupBy({
    by: ["teamId"],
    where: {
      teamId: { in: page.map((team) => team.id) },
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
    items: page.map(({ teamUsers, ...team }) => {
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
    nextCursor,
  };
}

export const emailsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  since: z.coerce.date().optional(),
});

/**
 * A team's latest emails, for a content check. The recipient list is reduced
 * to domains (the content itself may still mention an address).
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
 * admin pause, for new teams only (unless GUARD_ACTIONS is "all"); an admin
 * resumes it. The Guard can't block or resume.
 */
export async function recordTeamAction(
  teamId: number,
  body: z.infer<typeof teamActionBody>,
) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, createdAt: true },
  });
  if (!team) throw new GuardNotFoundError("Team not found");

  // Under "details", so these entries never look like a rules or admin action.
  const details = {
    ...(body.details ?? {}),
    source: GUARD_ACTOR,
  } as Prisma.InputJsonValue;

  if (body.action === "ALERT") {
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

  assertGuardMayAct(team);

  const changed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
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
