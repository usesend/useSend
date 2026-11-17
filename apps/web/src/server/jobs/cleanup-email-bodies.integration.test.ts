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
  retentionCutoff,
  type PendingStore,
  type Position,
} from "~/server/jobs/cleanup-email-bodies";

const describeIntegration = integrationEnabled ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const LONG_AGO = new Date("2025-06-01T00:00:00Z");

function memoryPending(): PendingStore & { ids: Map<string, number> } {
  const ids = new Map<string, number>();
  return {
    ids,
    due: async (now, limit) =>
      [...ids.entries()]
        .filter(([, at]) => at <= now)
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([id]) => id),
    schedule: async (entries) =>
      entries.forEach((entry) => ids.set(entry.id, entry.at)),
    remove: async (gone) => gone.forEach((id) => ids.delete(id)),
    size: async () => ids.size,
  };
}

describeIntegration("email content cleanup against postgres", () => {
  let teamId: number;
  const cutoff = retentionCutoff(90);
  const fast = { ...CLEANUP_LIMITS, batchSize: 2, pauseMs: 0 };

  async function createEmail(
    name: string,
    {
      created,
      updated = LONG_AGO,
      status = EmailStatus.DELIVERED,
      scheduledAt = null,
    }: {
      created: Date;
      updated?: Date;
      status?: EmailStatus;
      scheduledAt?: Date | null;
    },
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
    await db.$executeRaw`UPDATE "Email" SET "createdAt" = ${created}, "updatedAt" = ${updated} WHERE id = ${email.id}`;
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
      },
    });
  const clearedCount = () => db.email.count({ where: { html: null } });

  beforeEach(async () => {
    await resetDatabase();
    teamId = (await createTeam()).id;
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("clears content of emails sent over 90 days ago and keeps everything else", async () => {
    const old = [
      await createEmail("old-1", { created: daysAgo(200) }),
      await createEmail("old-2", { created: daysAgo(120) }),
      await createEmail("old-bounced", {
        created: daysAgo(95),
        status: EmailStatus.BOUNCED,
      }),
    ];
    const kept = [
      await createEmail("recent", {
        created: daysAgo(10),
        updated: daysAgo(10),
      }),
      await createEmail("old-but-scheduled", {
        created: daysAgo(120),
        status: EmailStatus.SCHEDULED,
        scheduledAt: daysAgo(-5),
      }),
      await createEmail("old-but-queued", {
        created: daysAgo(120),
        status: EmailStatus.QUEUED,
      }),
      // Created long ago but only sent 10 days ago: kept until 90 days after.
      await createEmail("old-but-sent-late", {
        created: daysAgo(120),
        updated: daysAgo(10),
      }),
    ];

    const result = await clearOldEmailBodies({
      cutoff,
      startAfter: null,
      saveProgress: async () => undefined,
      pending: memoryPending(),
      limits: fast,
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
      expect(email.subject).not.toBeNull();
      // updatedAt is untouched (the campaign page sorts by it).
      expect(email.updatedAt.toISOString()).toBe(LONG_AGO.toISOString());
    }
    for (const id of kept) {
      expect((await contentOf(id)).html).not.toBeNull();
    }
  });

  it("checks skipped emails again once they're due, and clears them then", async () => {
    const late = await createEmail("sent-late", {
      created: daysAgo(120),
      updated: daysAgo(10),
    });
    await createEmail("old", { created: daysAgo(130) });
    const pending = memoryPending();
    let position: Position | null = null;
    const runAt = (clock: number) =>
      clearOldEmailBodies({
        cutoff: retentionCutoff(90, clock),
        startAfter: position,
        saveProgress: async (p) => {
          position = p;
        },
        pending,
        limits: fast,
        now: () => clock,
      });

    await runAt(Date.now());
    expect((await contentOf(late)).html).not.toBeNull();
    // Due 90 days after it was sent, not before.
    const dueAt = pending.ids.get(late)!;
    expect(dueAt).toBeGreaterThan(Date.now() + 79 * DAY_MS);
    expect(dueAt).toBeLessThan(Date.now() + 81 * DAY_MS);

    // 70 days later: not due yet, not checked.
    const early = await runAt(Date.now() + 70 * DAY_MS);
    expect(early.pendingChecked).toBe(0);
    expect((await contentOf(late)).html).not.toBeNull();

    // 81 days later it was sent over 90 days ago.
    const later = await runAt(Date.now() + 81 * DAY_MS);
    expect(later).toMatchObject({ pendingChecked: 1, pendingCleared: 1 });
    expect((await contentOf(late)).html).toBeNull();
    expect(pending.ids.size).toBe(0);
  });

  it("keeps the recheck pass within the nightly cap", async () => {
    const pending = memoryPending();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(await createEmail(`p-${i}`, { created: daysAgo(100) }));
    await pending.schedule(ids.map((id) => ({ id, at: 0 })));

    const result = await clearOldEmailBodies({
      cutoff,
      startAfter: { createdAt: new Date(), id: "zzz" }, // nothing new to scan
      saveProgress: async () => undefined,
      pending,
      limits: { ...fast, maxRowsPerRun: 2 },
    });

    expect(result).toMatchObject({ cleared: 2, finished: false });
    expect(await clearedCount()).toBe(2);
    expect(pending.ids.size).toBe(3);
  });

  it("doesn't skip emails that share a creation time across batches", async () => {
    const sameTime = daysAgo(100);
    for (let i = 0; i < 5; i++)
      await createEmail(`tie-${i}`, { created: sameTime });

    let position: Position | null = null;
    const pending = memoryPending();
    // One email per batch, stopping after each: every resume starts mid-tie.
    for (let night = 0; night < 5; night++) {
      await clearOldEmailBodies({
        cutoff,
        startAfter: position,
        saveProgress: async (p) => {
          position = p;
        },
        pending,
        limits: { ...fast, batchSize: 1, maxRowsPerRun: 1 },
      });
    }

    expect(await clearedCount()).toBe(5);
  });

  it("stops exactly at the nightly cap, then carries on where it stopped", async () => {
    for (let i = 0; i < 4; i++) {
      await createEmail(`old-${i}`, { created: daysAgo(100 + i * 2) });
      // Interleaved with emails that can't be cleared yet.
      await createEmail(`late-${i}`, {
        created: daysAgo(101 + i * 2),
        updated: daysAgo(5),
      });
    }
    let position: Position | null = null;
    const pending = memoryPending();
    const limits = { ...fast, batchSize: 2, maxRowsPerRun: 3 };

    const first = await clearOldEmailBodies({
      cutoff,
      startAfter: null,
      saveProgress: async (p) => {
        position = p;
      },
      pending,
      limits,
    });
    expect(first.cleared).toBe(3);
    expect(first.finished).toBe(false);
    expect(await clearedCount()).toBe(3);

    const second = await clearOldEmailBodies({
      cutoff,
      startAfter: position,
      saveProgress: async (p) => {
        position = p;
      },
      pending,
      limits: { ...limits, maxRowsPerRun: 100 },
    });
    expect(second.cleared).toBe(1);
    expect(second.finished).toBe(true);
    expect(await clearedCount()).toBe(4);
    expect(pending.ids.size).toBe(4);
    expect(second.pendingLeft).toBe(4);
  });

  it("does nothing when no email is old enough", async () => {
    await createEmail("recent", { created: daysAgo(5), updated: daysAgo(5) });

    const result = await clearOldEmailBodies({
      cutoff,
      startAfter: null,
      saveProgress: async () => undefined,
      pending: memoryPending(),
    });

    expect(result).toMatchObject({ looked: 0, cleared: 0, finished: true });
  });
});
