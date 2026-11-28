// A new team's daily limit starts low and grows over its first two weeks, so a
// bought or scraped list can't be blasted the day an account is paid for.
// Pure, so tests and the limit check share it.
//
// Calibration (Nov 2026): of 31 teams that sent in their first 14 days over a
// year, every lasting customer stayed under 150 emails a day; the only ones
// above were one-off blasts (6,116, 2,952, 2,943 and 780 on day 0-1).

import { judgeCounts, type SendingCounts } from "./sending-rules";

/** The schema default for `Team.dailyEmailLimit`. Any other value was set by an admin. */
export const DEFAULT_DAILY_EMAIL_LIMIT = 10_000;

/** Per-day caps by account age (whole days since the team was created). */
export const NEW_SENDER_RAMP = [
  { beforeDay: 3, perDay: 200 },
  { beforeDay: 7, perDay: 1_000 },
  { beforeDay: 14, perDay: 5_000 },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today's cap for a team still in its first 14 days, or null when the ramp
 * doesn't apply: an older team, or one whose daily limit an admin set by hand
 * (e.g. a business moving its existing volume over on day one).
 *
 * A team whose sending so far would trip the bounce/complaint rules stays at
 * the first step instead of growing.
 */
export function newSenderDailyLimit(
  team: { createdAt?: Date | string | null; dailyEmailLimit: number },
  counts: SendingCounts,
  now = Date.now(),
): number | null {
  if (!team.createdAt) return null;
  if (team.dailyEmailLimit !== DEFAULT_DAILY_EMAIL_LIMIT) return null;
  const created = new Date(team.createdAt).getTime();
  if (Number.isNaN(created)) return null;
  const ageDays = Math.floor((now - created) / DAY_MS);
  const step = NEW_SENDER_RAMP.find((s) => ageDays < s.beforeDay);
  if (!step) return null;
  if (judgeCounts(counts).level !== "ok") return NEW_SENDER_RAMP[0].perDay;
  return step.perDay;
}

/** The email a team gets (once a day) when it reaches its new-account limit. */
export function newSenderLimitEmail(input: {
  teamName: string;
  limit: number;
  settingsUrl: string;
}) {
  const steps = NEW_SENDER_RAMP.map(
    (s, i) =>
      `- ${i === 0 ? "first 3 days" : `until day ${s.beforeDay}`}: ${s.perDay.toLocaleString()} emails a day`,
  ).join("\n");
  return {
    subject: "useSend: you've reached today's limit for new accounts",
    text: `Hi ${input.teamName} team,\n\nYou've sent ${input.limit.toLocaleString()} emails today, the daily limit for new accounts. Emails sent after that fail instead of going out; the limit resets at midnight UTC.\n\nNew accounts start lower and grow automatically over the first two weeks, as long as bounces and spam complaints stay low:\n${steps}\n- after that: your plan's full daily limit\n\nIf you're moving existing sending to useSend and need more from day one, reply to this email and tell us about it.\n\n${input.settingsUrl}\n\nuseSend`,
  };
}
