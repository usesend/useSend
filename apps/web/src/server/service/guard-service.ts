import { createHash } from "crypto";
import { WaitlistStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { env } from "~/env";
import { db } from "~/server/db";
import { logger } from "~/server/logger/log";
import IORedis from "ioredis";
import { redisKey } from "~/server/redis";
import { TeamService } from "~/server/service/team-service";
import { emailTeam } from "~/server/service/team-email";
import { sendToDiscord } from "~/server/service/notification-service";

/**
 * What the Guard (our separate review service) can read and do, through the
 * internal admin API. It reads applications, campaigns, new teams and their
 * emails; it can approve or stop a campaign, log an alert, and pause a team.
 * It can never block or resume a team, or delete anything, and it can only
 * pause teams in their first 14 days: established customers get alerts.
 *
 * New teams' campaigns wait for the Guard's check before sending, but only
 * while the Guard is running (it checks in by listing campaigns), and only
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

/** The Guard counts as running if it checked in within this many seconds. */
const GUARD_ALIVE_SECONDS = 120;
const GUARD_SEEN_KEY = "guard:last-seen";

let heartbeatClient: IORedis | null = null;

/**
 * Its own Redis connection that fails fast: if Redis is slow or down, sending
 * must not wait on "is the Guard running?". No offline queue (nothing is sent
 * later), one try, half a second per command.
 */
function heartbeatRedis() {
  if (!heartbeatClient || heartbeatClient.status === "end") {
    heartbeatClient = new IORedis(`${env.REDIS_URL}?family=0`, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 500,
      connectTimeout: 2_000,
      lazyConnect: false,
    });
    heartbeatClient.on("error", () => {
      // Errors surface as failed commands, handled below.
    });
  }
  return heartbeatClient;
}

/** Called when the Guard lists campaigns: it's running. */
export async function markGuardSeen() {
  try {
    await heartbeatRedis().set(
      redisKey(GUARD_SEEN_KEY),
      String(Date.now()),
      "EX",
      GUARD_ALIVE_SECONDS,
    );
  } catch (error) {
    logger.warn({ err: error }, "[Guard]: Couldn't record check-in");
  }
}

/**
 * New teams' campaigns wait only while the Guard is running (cloud only). If
 * it isn't, or Redis can't tell, nothing waits.
 */
export async function guardIsRunning() {
  if (!env.NEXT_PUBLIC_IS_CLOUD) return false;
  try {
    return (await heartbeatRedis().exists(redisKey(GUARD_SEEN_KEY))) === 1;
  } catch (error) {
    logger.warn({ err: error }, "[Guard]: Couldn't check if it's running");
    return false;
  }
}

function watchStart(now = Date.now()) {
  return new Date(now - WATCH_DAYS * DAY_MS);
}

export function isNewTeam(team: { createdAt: Date }) {
  return team.createdAt >= watchStart();
}

/** The Guard may stop campaigns and pause teams only of new teams. */
export function assertGuardMayAct(team: { createdAt: Date }) {
  if (isNewTeam(team)) return;
  throw new GuardForbiddenError(
    "The Guard may only act on teams in their first 14 days",
  );
}

/**
 * When a campaign of this team should stop waiting for the Guard, or null if
 * it doesn't wait (Guard not running, or the team is past its watch period).
 */
export async function reviewHoldFor(
  teamId: number,
  client: Pick<typeof db, "team"> = db,
): Promise<Date | null> {
  if (!env.NEXT_PUBLIC_IS_CLOUD) return null;
  // Team age first, so older teams never touch Redis here.
  const team = await client.team.findUnique({
    where: { id: teamId },
    select: { createdAt: true },
  });
  if (!team || !isNewTeam(team)) return null;
  if (!(await guardIsRunning())) return null;
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
  content: string | null;
}) {
  const hash = createHash("sha256");
  // The sender renders `content` when it's set, else `html`: both count.
  for (const part of [
    campaign.from,
    campaign.replyTo.join(","),
    campaign.subject,
    campaign.previewText,
    campaign.html,
    campaign.content,
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
  /** Only applications without the Guard's advice yet. */
  needsAdvice: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export async function listApplications(
  query: z.infer<typeof applicationsQuery>,
) {
  const items = await db.waitlistApplication.findMany({
    where: {
      status: query.status,
      ...(query.since ? { createdAt: { gt: query.since } } : {}),
      ...(query.needsAdvice ? { guardVerdict: null } : {}),
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
      guardVerdict: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  // `revision` changes on every resubmission; advice is saved against it.
  return {
    items: items.map(({ updatedAt, ...item }) => ({
      ...item,
      revision: updatedAt.toISOString(),
    })),
  };
}

export const applicationVerdictBody = z.object({
  verdict: z.enum(["approve", "reject", "unsure"]),
  note: z.string().trim().min(1).max(2_000),
  /** The `revision` the Guard reviewed. 409 if they resubmitted since. */
  revision: z.string().datetime(),
});

/**
 * Saves the Guard's advice on a pending application, for the admin page.
 * It's advice only: the founder lets people in or rejects them.
 */
export async function recordApplicationVerdict(
  id: string,
  input: z.infer<typeof applicationVerdictBody>,
) {
  const revision = new Date(input.revision);
  const { count } = await db.waitlistApplication.updateMany({
    where: { id, status: "PENDING", updatedAt: revision },
    // Keep updatedAt, so the revision only changes when they resubmit.
    data: {
      guardVerdict: input.verdict,
      guardNote: input.note,
      updatedAt: revision,
    },
  });
  if (count === 0) {
    const current = await db.waitlistApplication.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new GuardNotFoundError("Application not found");
    throw new GuardConflictError(
      current.status === "PENDING"
        ? "They resubmitted since you read it: read it again"
        : "Application was already decided",
    );
  }
  return { ok: true };
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
  const nextCursor =
    rows.length > query.limit ? (pageIds.at(-1) ?? null) : null;
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
      content: true,
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
    items: campaigns.map(({ html, content, team, ...campaign }) => ({
      ...campaign,
      html: truncate(html, CAMPAIGN_HTML_MAX),
      htmlTruncated: (html?.length ?? 0) > CAMPAIGN_HTML_MAX,
      contentHash: campaignContentHash({ ...campaign, html, content }),
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
 * to domains (the content itself may still mention an address). Both text and
 * HTML are returned: for campaign emails, `text` is only the preview text.
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
      html: truncate(html, EMAIL_TEXT_MAX),
    })),
  };
}

export const teamActionBody = z.object({
  action: z.enum(["ALERT", "PAUSE"]),
  reason: z.string().trim().min(1).max(2_000),
  details: z.record(z.unknown()).optional(),
  /** The rule broken. Needed to pause a team past its first 14 days. */
  abuse: z
    .enum([
      "phishing",
      "scam",
      "cold_outreach",
      "gambling",
      "adult",
      "money_scheme",
      "pharma",
    ])
    .optional(),
  /** The team's emails that show the abuse. Needed with `abuse`. */
  emailIds: z.array(z.string().min(1)).min(1).max(20).optional(),
});

const ABUSE_LABEL = {
  phishing:
    "phishing (pretending to be another company to get people's details)",
  scam: "a scam",
  cold_outreach:
    "cold outreach (emails to people who never signed up to hear from you)",
  gambling: "gambling or betting",
  adult: "adult content",
  money_scheme: "crypto, trading, MLM or make-money schemes",
  pharma: "pharmaceuticals or supplements with medical claims",
} as const;

/** Kinds that usually mean someone else used the account. */
const LIKELY_LEAKED = new Set(["phishing", "scam"]);

/** The email a team gets when the Guard pauses it for phishing or a scam. */
export function abusePauseEmail(input: {
  teamName: string;
  abuse: keyof typeof ABUSE_LABEL;
  subjects: string[];
}) {
  // Their own subjects, but cleaned: one line, no links or domains, short.
  const subjects = input.subjects
    .map((subject) =>
      subject
        .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "")
        .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b(?:\/\S*)?/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100),
    )
    .filter(Boolean)
    .slice(0, 3)
    .map((subject) => `- "${subject}"`)
    .join("\n");
  return {
    subject: "useSend: we paused sending on your account",
    text: `Hi ${input.teamName} team,\n\nWe paused sending on your useSend account because emails sent from it look like ${ABUSE_LABEL[input.abuse]}, which our terms don't allow, for example:\n${subjects}\n\n${
      LIKELY_LEAKED.has(input.abuse)
        ? "If you didn't send these, one of your API keys has probably leaked, often from a hacked website. Delete that key in useSend, create a new one, and check the site that used it.\n\nReply to this email and we'll turn sending back on once it's sorted."
        : "If we got this wrong, reply to this email and tell us who these emails go to and how they signed up; we'll take another look."
    } While sending is paused, new emails fail instead of going out.\n\nuseSend`,
  };
}

/**
 * ALERT only logs. PAUSE stops the team's sending and its campaigns, like an
 * admin pause, for new teams only; an admin
 * resumes it. The Guard can't block or resume.
 */
export async function recordTeamAction(
  teamId: number,
  body: z.infer<typeof teamActionBody>,
) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, createdAt: true },
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

  // The Guard only ever pauses new teams. An established customer is never
  // paused automatically: the Guard alerts and the founder decides.
  assertGuardMayAct(team);
  let evidence: Array<{ subject: string }> = [];
  if (body.abuse) {
    const ids = [...new Set(body.emailIds ?? [])];
    if (ids.length === 0) {
      throw new GuardForbiddenError("Name the emails that show it (emailIds)");
    }
    evidence = await db.email.findMany({
      where: { id: { in: ids }, teamId },
      select: { subject: true },
    });
    if (evidence.length !== ids.length) {
      throw new GuardForbiddenError("Some of those emails aren't this team's");
    }
  }

  const changed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
    const { count } = await tx.team.updateMany({
      // Still new at the moment of the pause, not just when it was checked.
      where: {
        id: teamId,
        isBlocked: false,
        sendingPausedAt: null,
        createdAt: { gte: watchStart() },
      },
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
    // Always tell the founder, whatever the agent posts itself.
    try {
      await sendToDiscord(guardPauseNotice(team, body, evidence.length));
    } catch (error) {
      logger.error({ err: error, teamId }, "[Guard]: Discord notice failed");
    }
    if (body.abuse) {
      // Tell them, so they can find a leaked key. emailTeam never throws.
      const message = abusePauseEmail({
        teamName: team.name,
        abuse: body.abuse,
        subjects: [...new Set(evidence.map((email) => email.subject))],
      });
      await emailTeam(teamId, message.subject, message.text);
    }
  }
  return { ok: true, changed };
}

/** The Discord message for every Guard pause. */
export function guardPauseNotice(
  team: { id: number; name: string; createdAt: Date },
  body: z.infer<typeof teamActionBody>,
  evidenceCount: number,
) {
  const age = isNewTeam(team)
    ? "new team"
    : `customer since ${team.createdAt.toISOString().slice(0, 10)}`;
  const why = body.abuse
    ? `${body.abuse.replace("_", " ")} (${evidenceCount} email${evidenceCount === 1 ? "" : "s"} as evidence). The team has been emailed.`
    : "clear abuse.";
  return `🛑 **Guard paused ${team.name}** (#${team.id}, ${age}) for ${why}\n${body.reason.slice(0, 600)}\nResume on the admin teams page if it's wrong: ${env.NEXTAUTH_URL}/admin/teams`;
}

// --- New emails (API and SMTP, not campaigns) ---

const COMMIT_SETTLE_MS = 30_000;

export const newEmailsQuery = z.object({
  /** From `nextCursor`; without it, starts from the last 10 minutes. */
  cursor: z
    .string()
    .regex(/^\d{4}-\d\d-\d\dT[\d:.]+Z\|[\w-]*$/)
    .refine((cursor) => !Number.isNaN(Date.parse(cursor.split("|")[0]!)), {
      message: "Invalid cursor timestamp",
    })
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * Emails sent through the API or SMTP since the cursor, oldest first, across
 * all teams, for the Guard's content check. Campaign emails are checked
 * through their campaign instead. Recipients are reduced to their domains.
 */
export async function listNewEmails(query: z.infer<typeof newEmailsQuery>) {
  const [afterIso, afterId] = query.cursor?.split("|") ?? [];
  const after = afterIso
    ? new Date(afterIso)
    : new Date(Date.now() - 10 * 60_000);
  const rows = await db.email.findMany({
    where: {
      campaignId: null,
      // A date range first, so the createdAt index does the work; then skip
      // what the last page already returned at that same instant.
      // Only rows at least 30s old: an insert can get its timestamp before
      // it commits, so newer rows could still appear behind the cursor.
      createdAt: { gte: after, lt: new Date(Date.now() - COMMIT_SETTLE_MS) },
      ...(afterId ? { NOT: { createdAt: after, id: { lte: afterId } } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: query.limit,
    select: {
      id: true,
      createdAt: true,
      from: true,
      to: true,
      replyTo: true,
      subject: true,
      text: true,
      html: true,
      team: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          isBlocked: true,
          sendingPausedAt: true,
        },
      },
    },
  });
  const last = rows.at(-1);
  return {
    items: rows.map(({ to, text, html, team, ...email }) => ({
      ...email,
      toDomains: [
        ...new Set(to.map((address) => address.split("@")[1] ?? "")),
      ].filter(Boolean),
      text: truncate(text, EMAIL_TEXT_MAX),
      html: truncate(html, EMAIL_TEXT_MAX),
      team: { ...team, isNew: isNewTeam(team) },
    })),
    nextCursor: last
      ? `${last.createdAt.toISOString()}|${last.id}`
      : (query.cursor ?? `${after.toISOString()}|`),
  };
}
