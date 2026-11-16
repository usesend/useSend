import { WebhookCallStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import { createTeam } from "~/test/factories/core";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetDatabase,
} from "~/test/integration/helpers";

// Only the database is real here: the job module's queue and worker are not
// needed to test the deletion itself.
vi.mock("bullmq", () => ({
  Queue: class {
    upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
  },
  Worker: class {
    on = vi.fn();
  },
}));

import { deleteOldWebhookCalls } from "~/server/jobs/webhook-cleanup-job";

const describeIntegration = integrationEnabled ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

describeIntegration("webhook cleanup against postgres", () => {
  let webhookId: string;
  let teamId: number;

  async function createCall(
    name: string,
    status: WebhookCallStatus,
    createdDaysAgo: number,
    updatedDaysAgo: number,
  ) {
    const call = await db.webhookCall.create({
      data: {
        webhookId,
        teamId,
        type: "email.sent",
        payload: JSON.stringify({ name }),
        status,
      },
    });
    const createdAt = new Date(Date.now() - createdDaysAgo * DAY_MS);
    const updatedAt = new Date(Date.now() - updatedDaysAgo * DAY_MS);
    await db.$executeRaw`UPDATE "WebhookCall" SET "createdAt" = ${createdAt}, "updatedAt" = ${updatedAt} WHERE id = ${call.id}`;
    return call.id;
  }

  beforeEach(async () => {
    await resetDatabase();
    const team = await createTeam();
    teamId = team.id;
    const webhook = await db.webhook.create({
      data: {
        teamId,
        url: "https://example.com/hook",
        secret: "whsec_test",
        eventTypes: [],
      },
    });
    webhookId = webhook.id;
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("deletes only finished calls that are over 30 days old and untouched since", async () => {
    const deletedIds = [
      await createCall("old delivered 1", WebhookCallStatus.DELIVERED, 60, 60),
      await createCall("old delivered 2", WebhookCallStatus.DELIVERED, 45, 45),
      await createCall("old failed", WebhookCallStatus.FAILED, 50, 49),
      await createCall("old discarded", WebhookCallStatus.DISCARDED, 40, 40),
    ];
    const keptIds = [
      await createCall("old but pending", WebhookCallStatus.PENDING, 60, 60),
      await createCall(
        "old in progress",
        WebhookCallStatus.IN_PROGRESS,
        60,
        60,
      ),
      await createCall(
        "old, retried today",
        WebhookCallStatus.DELIVERED,
        60,
        0,
      ),
      await createCall("recent", WebhookCallStatus.DELIVERED, 2, 2),
    ];

    const result = await deleteOldWebhookCalls({
      cutoff: new Date(Date.now() - 30 * DAY_MS),
      batchSize: 3,
      pauseMs: 0,
    });

    expect(result).toMatchObject({ deleted: 4, batches: 2, finished: true });
    const remaining = await db.webhookCall.findMany({ select: { id: true } });
    expect(remaining.map((row) => row.id).sort()).toEqual([...keptIds].sort());
    expect(deletedIds.every((id) => !remaining.some((r) => r.id === id))).toBe(
      true,
    );
  });

  it("does nothing when nothing is old enough", async () => {
    await createCall("recent", WebhookCallStatus.DELIVERED, 1, 1);

    const result = await deleteOldWebhookCalls({
      cutoff: new Date(Date.now() - 30 * DAY_MS),
      pauseMs: 0,
    });

    expect(result).toMatchObject({ deleted: 0, batches: 0, finished: true });
    expect(await db.webhookCall.count()).toBe(1);
  });
});
