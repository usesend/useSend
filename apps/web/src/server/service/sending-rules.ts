// Pure bounce/complaint rules, kept free of imports so the SES event parser
// and tests can use them without loading the database or mailer.

/**
 * Bounce and complaint limits. A level needs both the rate and a minimum
 * count, so a single bounce or complaint never trips anything. They sit below
 * the rates at which AWS reviews our whole SES account (5% / 0.1%).
 */
export const SENDING_RULES = {
  /** Bounces and complaints are counted over this many days... */
  windowDays: 7,
  /** ...against sends over this many, since complaints arrive late. */
  sendWindowDays: 10,
  pause: {
    bounceRate: 0.025,
    minBounces: 5,
    complaintRate: 0.0008,
    minComplaints: 2,
  },
  block: {
    bounceRate: 0.05,
    minBounces: 10,
    complaintRate: 0.003,
    minComplaints: 3,
  },
} as const;

const SPAM_TRAP_PATTERN = /spam[\s_-]?trap|honey[\s_-]?pot/i;

export type SendingCounts = {
  sent: number;
  hardBounced: number;
  complained: number;
};

export type Verdict =
  { level: "ok" } | { level: "pause" | "block"; reason: string };

function percent(rate: number) {
  return `${(rate * 100).toFixed(2)}%`;
}

/** Applies the limits to a set of counts. Block is checked before pause. */
export function judgeCounts(counts: SendingCounts): Verdict {
  const sent = Math.max(counts.sent, counts.hardBounced, counts.complained, 1);
  const bounceRate = counts.hardBounced / sent;
  const complaintRate = counts.complained / sent;

  for (const level of ["block", "pause"] as const) {
    const limits = SENDING_RULES[level];
    if (
      counts.hardBounced >= limits.minBounces &&
      bounceRate > limits.bounceRate
    ) {
      return {
        level,
        reason: `too many emails bounced: ${percent(bounceRate)} (${counts.hardBounced.toLocaleString()} of ${sent.toLocaleString()})`,
      };
    }
    if (
      counts.complained >= limits.minComplaints &&
      complaintRate > limits.complaintRate
    ) {
      return {
        level,
        reason: `too many people marked your emails as spam: ${percent(complaintRate)} (${counts.complained.toLocaleString()} of ${sent.toLocaleString()})`,
      };
    }
  }

  return { level: "ok" };
}

/** A hard bounce whose diagnostic names a spam trap or honeypot. */
export function isSpamTrapBounce(bounce: unknown): boolean {
  const recipients = (
    bounce as { bouncedRecipients?: Array<{ diagnosticCode?: string }> }
  )?.bouncedRecipients;
  if (!Array.isArray(recipients)) return false;
  return recipients.some((recipient) =>
    SPAM_TRAP_PATTERN.test(recipient?.diagnosticCode ?? ""),
  );
}
