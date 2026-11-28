import { describe, expect, it } from "vitest";

import {
  DEFAULT_DAILY_EMAIL_LIMIT,
  newSenderDailyLimit,
  newSenderLimitEmail,
} from "~/server/service/new-sender-ramp";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-12-20T12:00:00Z");
const clean = { sent: 0, hardBounced: 0, complained: 0 };
const team = (
  ageDays: number,
  dailyEmailLimit = DEFAULT_DAILY_EMAIL_LIMIT,
) => ({
  createdAt: new Date(now - ageDays * DAY - 60_000),
  dailyEmailLimit,
});

describe("newSenderDailyLimit", () => {
  it("starts at 200 a day and grows over the first two weeks", () => {
    expect(newSenderDailyLimit(team(0), clean, now)).toBe(200);
    expect(newSenderDailyLimit(team(2), clean, now)).toBe(200);
    expect(newSenderDailyLimit(team(3), clean, now)).toBe(1_000);
    expect(newSenderDailyLimit(team(6), clean, now)).toBe(1_000);
    expect(newSenderDailyLimit(team(7), clean, now)).toBe(5_000);
    expect(newSenderDailyLimit(team(13), clean, now)).toBe(5_000);
  });

  it("never applies to established teams", () => {
    expect(newSenderDailyLimit(team(14), clean, now)).toBeNull();
    expect(newSenderDailyLimit(team(400), clean, now)).toBeNull();
  });

  it("never applies to teams created before it shipped (existing customers)", () => {
    const created = Date.parse("2026-11-27T23:00:00Z");
    expect(
      newSenderDailyLimit(
        {
          createdAt: new Date(created),
          dailyEmailLimit: DEFAULT_DAILY_EMAIL_LIMIT,
        },
        clean,
        created + DAY,
      ),
    ).toBeNull();
  });

  it("skips teams whose limit an admin set by hand", () => {
    expect(newSenderDailyLimit(team(0, 50_000), clean, now)).toBeNull();
    expect(newSenderDailyLimit(team(0, 500), clean, now)).toBeNull();
  });

  it("skips a team without a creation date (e.g. an old cache entry)", () => {
    expect(
      newSenderDailyLimit(
        { dailyEmailLimit: DEFAULT_DAILY_EMAIL_LIMIT },
        clean,
        now,
      ),
    ).toBeNull();
  });

  it("doesn't grow while bounces or complaints are high", () => {
    const complaints = { sent: 600, hardBounced: 0, complained: 3 };
    const bounces = { sent: 600, hardBounced: 30, complained: 0 };
    expect(newSenderDailyLimit(team(8), complaints, now)).toBe(200);
    expect(newSenderDailyLimit(team(4), bounces, now)).toBe(200);
    // A single complaint doesn't hold it back.
    expect(
      newSenderDailyLimit(
        team(8),
        { sent: 600, hardBounced: 1, complained: 1 },
        now,
      ),
    ).toBe(5_000);
  });
});

describe("newSenderLimitEmail", () => {
  it("explains the limit, the schedule and how to ask for more", () => {
    const { subject, text } = newSenderLimitEmail({
      teamName: "Acme",
      limit: 200,
      settingsUrl: "https://app.usesend.com/settings",
    });
    expect(subject).toContain("limit for new accounts");
    expect(text).toContain(
      "You've sent 200 emails today (each recipient counts as one)",
    );
    expect(text).toContain("first 3 days: 200 emails a day");
    expect(text).toContain("until day 7: 1,000 emails a day");
    expect(text).toContain("until day 14: 5,000 emails a day");
    expect(text).toContain("reply to this email");
  });
});
