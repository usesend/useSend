import { EmailStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import { createTeam } from "~/test/factories/core";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetDatabase,
} from "~/test/integration/helpers";

// Only the database is real here; the job's queue and worker aren't needed.
vi.mock("bullmq", () => ({
  Queue: class {
    upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
  },
  Worker: class {
    on = vi.fn();
  },
}));

import {
  CLEANUP_LIMITS,
  clearOldEmailBodies,
} from "~/server/jobs/cleanup-email-bodies";

const describeIntegration = integrationEnabled ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

describeIntegration("email content cleanup against postgres", () => {
  let teamId: number;
  const cutoff = daysAgo(90);

  async function createEmail(
    name: string,
    createdDaysAgo: number,
    status: EmailStatus = EmailStatus.DELIVERED,
    scheduledAt: Date | null = null,
  ) {
    const email = await db.email.create({
      data: {
        teamId,
        from: "news@example.com",
        to: [`${name}@example.com`],
        subject: name,
        html: `<p>${name}</p>`,
        text: name,
        attachments: "[]",
        headers: "{}",
        latestStatus: status,
        scheduledAt,
      },
    });
    const createdAt = daysAgo(createdDaysAgo);
    const updatedAt = new Date("2026-01-01T00:00:00Z");
    await db.$executeRaw`UPDATE "Email" SET "createdAt" = ${createdAt}, "updatedAt" = ${updatedAt} WHERE id = ${email.id}`;
    return email.id;
  }

  const contentOf = (id: string) =>
    db.email.findUniqueOrThrow({
      where: { id },
      select: {
        html: true,
        text: true,
        attachments: true,
        headers: true,
        updatedAt: true,
        subject: true,
        latestStatus: true,
      },
    });

  beforeEach(async () => {
    await resetDatabase();
    teamId = (await createTeam()).id;
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("clears content of emails older than the cutoff and keeps everything else", async () => {
    const old = [
      await createEmail("old-1", 200),
      await createEmail("old-2", 120),
      await createEmail("old-bounced", 95, EmailStatus.BOUNCED),
    ];
    const kept = [
      await createEmail("recent", 10),
      await createEmail(
        "old-but-scheduled",
        120,
        EmailStatus.SCHEDULED,
        daysAgo(-5),
      ),
      await createEmail("old-but-queued", 120, EmailStatus.QUEUED),
      await createEmail(
        "old-scheduled-after-cutoff",
        120,
        EmailStatus.SENT,
        daysAgo(30),
      ),
    ];
    const saved: string[] = [];

    const result = await clearOldEmailBodies({
      cutoff,
      startAfter: null,
      saveProgress: async (p) => {
        saved.push(p.id);
      },
      limits: { ...CLEANUP_LIMITS, batchSize: 2, pauseMs: 0 },
    });

    expect(result).toMatchObject({ cleared: 3, finished: true });
    for (const id of old) {
      const email = await contentOf(id);
      expect(email).toMatchObject({
        html: null,
        text: null,
        attachments: null,
        headers: null,
      });
      // Status, subject and updatedAt are untouched.
      expect(email.subject).not.toBeNull();
      expect(email.updatedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    }
    for (const id of kept) {
      expect((await contentOf(id)).html).not.toBeNull();
    }
    expect(saved.length).toBeGreaterThan(0);
  });

  it("stops at the nightly cap and the next run carries on where it stopped", async () => {
    for (let i = 0; i < 5; i++) await createEmail(`old-${i}`, 100 + i);
    let position: { createdAt: Date; id: string } | null = null;
    const limits = {
      ...CLEANUP_LIMITS,
      batchSize: 2,
      maxRowsPerRun: 2,
      pauseMs: 0,
    };

    const first = await clearOldEmailBodies({
      cutoff,
      startAfter: null,
      saveProgress: async (p) => {
        position = p;
      },
      limits,
    });
    expect(first).toMatchObject({ cleared: 2, finished: false });
    expect(await db.email.count({ where: { html: null } })).toBe(2);

    const second = await clearOldEmailBodies({
      cutoff,
      startAfter: position,
      saveProgress: async (p) => {
        position = p;
      },
      limits: { ...limits, maxRowsPerRun: 100 },
    });
    expect(second).toMatchObject({ cleared: 3, finished: true });
    // The second run started after the first one's position: it didn't look
    // at the two emails already cleared.
    expect(second.looked).toBe(3);
    expect(await db.email.count({ where: { html: null } })).toBe(5);
  });

  it("does nothing when no email is old enough", async () => {
    await createEmail("recent", 5);

    const result = await clearOldEmailBodies({
      cutoff,
      startAfter: null,
      saveProgress: async () => undefined,
    });

    expect(result).toMatchObject({ looked: 0, cleared: 0, finished: true });
  });
});
