import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { UnsubscribeReason } from "@prisma/client";

const { mockDb, mockTx, mockUpdateContactSubscription } = vi.hoisted(() => {
  const mockTx = {
    $queryRaw: vi.fn(),
    team: {
      findUnique: vi.fn(),
    },
    campaign: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    teamAction: {
      create: vi.fn(),
    },
    campaignEmail: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    email: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    emailEvent: {
      create: vi.fn(),
    },
  };

  return {
    mockTx,
    mockDb: {
      $transaction: vi.fn(async (callback: (tx: typeof mockTx) => unknown) =>
        callback(mockTx),
      ),
      contact: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      contactBook: {
        findUnique: vi.fn(),
      },
      domain: {
        findUnique: vi.fn(),
      },
      team: {
        findUnique: vi.fn(),
      },
      teamAction: {
        findFirst: vi.fn(),
      },
      campaign: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      campaignEmail: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      email: {
        create: vi.fn(),
      },
    },
    mockUpdateContactSubscription: vi.fn(),
  };
});

const {
  mockQueueAdd,
  mockQueueGetJob,
  capturedBatchHandler,
  mockCheckSuppressions,
  mockQueueEmail,
  mockReviewHoldFor,
  mockAssertGuardMayAct,
  mockEmailTeam,
} = vi.hoisted(() => ({
  mockReviewHoldFor: vi.fn(),
  mockAssertGuardMayAct: vi.fn(),
  mockEmailTeam: vi.fn(async () => undefined),
  mockQueueAdd: vi.fn(),
  mockQueueGetJob: vi.fn(),
  capturedBatchHandler: {
    handler: null as any,
  },
  mockCheckSuppressions: vi.fn(),
  mockQueueEmail: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("@usesend/email-editor/src/renderer", () => ({
  EmailRenderer: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: {
    NEXTAUTH_SECRET: "test-secret",
  },
}));

vi.mock("~/server/service/contact-service", () => ({
  updateContactSubscription: mockUpdateContactSubscription,
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = mockQueueAdd;
    getJob = mockQueueGetJob;
  },
  Worker: class {
    on = vi.fn();
    constructor(queueName: string, handler: any) {
      if (queueName === "campaign-batch")
        capturedBatchHandler.handler = handler;
    }
  },
}));

vi.mock("~/server/redis", () => ({
  getRedis: vi.fn(() => ({})),
  BULL_PREFIX: "test",
}));

vi.mock("~/server/service/email-queue-service", () => ({
  EmailQueueService: { queueEmail: mockQueueEmail },
}));

vi.mock("~/server/queue/bullmq-context", () => ({
  createWorkerHandler: vi.fn((handler) => handler),
}));

vi.mock("~/server/service/suppression-service", () => ({
  SuppressionService: { checkMultipleEmails: mockCheckSuppressions },
}));

vi.mock("~/server/service/domain-service", () => ({
  validateApiKeyDomainAccess: vi.fn(),
  validateDomainFromEmail: vi.fn(),
}));

vi.mock("~/server/service/team-email", () => ({ emailTeam: mockEmailTeam }));

vi.mock("~/server/service/guard-service", () => ({
  GUARD_ACTOR: "guard",
  GuardConflictError: class GuardConflictError extends Error {},
  GuardNotFoundError: class GuardNotFoundError extends Error {},
  reviewBody: {},
  reviewHoldFor: mockReviewHoldFor,
  assertGuardMayAct: mockAssertGuardMayAct,
  campaignContentHash: (c: { subject: string; html: string | null }) =>
    `${c.subject}|${c.html}`,
  isReviewHeld: (campaign: { reviewHoldUntil?: Date | null }) =>
    Boolean(
      campaign.reviewHoldUntil &&
        campaign.reviewHoldUntil.getTime() > Date.now(),
    ),
}));

vi.mock("~/server/logger/log", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  CampaignBatchService,
  recordCampaignContactFailure,
  adminReleaseCampaign,
  campaignOnHoldEmail,
  customerReason,
  guardHoldFor,
  guardReviewCampaign,
  resumeCampaign,
  scheduleCampaign,
  subscribeContact,
  unsubscribeContact,
} from "~/server/service/campaign-service";

const input = {
  contact: {
    id: "contact_1",
    email: "alice@example.com",
  },
  campaign: {
    id: "campaign_1",
    from: "sender@example.com",
    subject: "Hello",
    html: "<p>Hello</p>",
    previewText: "Preview",
  },
  emailConfig: {
    replyTo: ["reply@example.com"],
    cc: [],
    bcc: [],
    teamId: 7,
    domainId: 11,
  },
  error: new Error("Queue for region ap-southeast-2 not found"),
};

describe("recordCampaignContactFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks an existing campaign email as failed and records the error", async () => {
    mockTx.campaignEmail.findUnique.mockResolvedValue({ emailId: "email_1" });

    await recordCampaignContactFailure(input);

    expect(mockTx.email.create).not.toHaveBeenCalled();
    expect(mockTx.email.update).toHaveBeenCalledWith({
      where: { id: "email_1" },
      data: { latestStatus: "FAILED" },
    });
    expect(mockTx.emailEvent.create).toHaveBeenCalledWith({
      data: {
        emailId: "email_1",
        status: "FAILED",
        data: { error: "Queue for region ap-southeast-2 not found" },
        teamId: 7,
      },
    });
  });

  it("creates a failed email and campaign link when processing failed before persistence", async () => {
    mockTx.campaignEmail.findUnique.mockResolvedValue(null);
    mockTx.email.findFirst.mockResolvedValue(null);
    mockTx.email.create.mockResolvedValue({ id: "email_2" });

    await recordCampaignContactFailure(input);

    expect(mockTx.email.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        to: ["alice@example.com"],
        campaignId: "campaign_1",
        contactId: "contact_1",
        latestStatus: "FAILED",
      }),
      select: { id: true },
    });
    expect(mockTx.campaignEmail.create).toHaveBeenCalledWith({
      data: {
        campaignId: "campaign_1",
        contactId: "contact_1",
        emailId: "email_2",
      },
    });
    expect(mockTx.emailEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailId: "email_2",
        status: "FAILED",
      }),
    });
  });

  it("reuses an email created before campaign linking failed", async () => {
    mockTx.campaignEmail.findUnique.mockResolvedValue(null);
    mockTx.email.findFirst.mockResolvedValue({ id: "email_3" });

    await recordCampaignContactFailure(input);

    expect(mockTx.email.create).not.toHaveBeenCalled();
    expect(mockTx.campaignEmail.create).toHaveBeenCalledWith({
      data: {
        campaignId: "campaign_1",
        contactId: "contact_1",
        emailId: "email_3",
      },
    });
    expect(mockTx.email.update).toHaveBeenCalledWith({
      where: { id: "email_3" },
      data: { latestStatus: "FAILED" },
    });
  });
});

describe("CampaignBatchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues batches with a BullMQ-safe custom job ID", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      lastSentAt: null,
      batchWindowMinutes: 0,
      status: "SCHEDULED",
    });

    await CampaignBatchService.queueBatch({
      campaignId: "campaign_1",
      teamId: 7,
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "campaign-campaign_1",
      { campaignId: "campaign_1", teamId: 7 },
      expect.objectContaining({ jobId: "campaign-batch-campaign_1" }),
    );
  });

  describe("after a batch failed", () => {
    const failedJob = (failedSecondsAgo: number) => ({
      isFailed: vi.fn().mockResolvedValue(true),
      isCompleted: vi.fn().mockResolvedValue(false),
      finishedOn: Date.now() - failedSecondsAgo * 1000,
      retry: vi.fn().mockResolvedValue(undefined),
    });

    const seenUpdatedAt = new Date("2026-11-16T10:00:00Z");

    beforeEach(() => {
      mockDb.campaign.findUnique.mockResolvedValue({
        lastSentAt: null,
        batchWindowMinutes: 0,
        status: "RUNNING",
        updatedAt: seenUpdatedAt,
      });
    });

    it("retries the batch a minute later, with its attempts reset", async () => {
      const job = failedJob(61);
      mockQueueGetJob.mockResolvedValue(job);

      await CampaignBatchService.queueBatch({
        campaignId: "campaign_1",
        teamId: 7,
      });

      expect(mockQueueGetJob).toHaveBeenCalledWith("campaign-batch-campaign_1");
      expect(job.retry).toHaveBeenCalledWith("failed", {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("waits before retrying a batch that just failed", async () => {
      const job = failedJob(10);
      mockQueueGetJob.mockResolvedValue(job);

      await CampaignBatchService.queueBatch({
        campaignId: "campaign_1",
        teamId: 7,
      });

      expect(job.retry).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("pauses a campaign whose batch failed over a day ago instead of restarting it", async () => {
      const job = failedJob(25 * 60 * 60);
      mockQueueGetJob.mockResolvedValue(job);
      mockDb.campaign.updateMany.mockResolvedValue({ count: 1 });

      await CampaignBatchService.queueBatch({
        campaignId: "campaign_1",
        teamId: 7,
      });

      expect(job.retry).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
      // Only if nothing changed the campaign since it was read (e.g. a resume).
      expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
        where: {
          id: "campaign_1",
          status: { in: ["SCHEDULED", "RUNNING"] },
          updatedAt: seenUpdatedAt,
        },
        data: { status: "PAUSED" },
      });
    });

    it("does not pause if the failed batch was cleared in the meantime", async () => {
      // queueBatch sees the old failed job, then a reschedule clears it before
      // the pause: the second look finds no job.
      mockQueueGetJob
        .mockResolvedValueOnce(failedJob(25 * 60 * 60))
        .mockResolvedValueOnce(undefined);

      await CampaignBatchService.queueBatch({
        campaignId: "campaign_1",
        teamId: 7,
      });

      expect(mockDb.campaign.updateMany).not.toHaveBeenCalled();
    });

    it("does not pause when it couldn't read the campaign first", async () => {
      mockDb.campaign.findUnique.mockRejectedValue(new Error("db timeout"));
      mockQueueGetJob.mockResolvedValue(failedJob(25 * 60 * 60));

      await CampaignBatchService.queueBatch({
        campaignId: "campaign_1",
        teamId: 7,
      });

      expect(mockDb.campaign.updateMany).not.toHaveBeenCalled();
    });

    it("does not queue a second copy of a batch that is still running", async () => {
      const job = {
        isFailed: vi.fn().mockResolvedValue(false),
        isCompleted: vi.fn().mockResolvedValue(false),
        retry: vi.fn(),
      };
      mockQueueGetJob.mockResolvedValue(job);

      await CampaignBatchService.queueBatch({
        campaignId: "campaign_1",
        teamId: 7,
      });

      expect(job.retry).not.toHaveBeenCalled();
      // add() is still sent with the same job id, in case the job finished
      // during the checks; BullMQ ignores it while the job exists (see the
      // requeueJob integration tests).
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "campaign-campaign_1",
        { campaignId: "campaign_1", teamId: 7 },
        expect.objectContaining({ jobId: "campaign-batch-campaign_1" }),
      );
    });
  });
});

describe("scheduleCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      status: "PAUSED",
      contactBookId: "book_1",
      content: null,
      html: '<p>Hi <a href="{{unsend_unsubscribe_url}}">Unsubscribe</a></p>',
    });
    mockDb.contact.count.mockResolvedValue(3);
    mockTx.campaign.update.mockResolvedValue({});
    mockTx.campaign.findUnique.mockResolvedValue({ guardStoppedAt: null });
    mockReviewHoldFor.mockResolvedValue(null);
  });

  it("won't schedule a campaign the Guard stopped", async () => {
    mockTx.campaign.findUnique.mockResolvedValue({ guardStoppedAt: new Date() });

    await expect(
      scheduleCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Our team is reviewing this campaign");

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });

  it("makes a new team's campaign wait for the Guard's check", async () => {
    const until = new Date(Date.now() + 10 * 60 * 1000);
    mockReviewHoldFor.mockResolvedValue(until);
    mockQueueGetJob.mockResolvedValue(null);

    await scheduleCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(mockReviewHoldFor).toHaveBeenCalledWith(7);
    expect(mockTx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewHoldUntil: until }),
      }),
    );
  });

  it("clears a batch that failed long ago, so the campaign isn't paused again", async () => {
    const job = {
      isFailed: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockQueueGetJob.mockResolvedValue(job);

    await scheduleCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(job.remove).toHaveBeenCalled();
    expect(mockTx.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "campaign_1" },
        data: expect.objectContaining({ status: "SCHEDULED" }),
      }),
    );
    // The new schedule is saved before the failed batch is cleared, so the
    // scheduler can't start an early batch in between.
    expect(mockTx.campaign.update.mock.invocationCallOrder[0]).toBeLessThan(
      job.remove.mock.invocationCallOrder[0]!,
    );
  });
});

describe("resumeCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      scheduledAt: null,
    });
    mockDb.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: null,
    });
    mockTx.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: null,
    });
    mockTx.campaign.update.mockResolvedValue({});
    mockTx.campaign.findUnique.mockResolvedValue({ guardStoppedAt: null });
    mockReviewHoldFor.mockResolvedValue(null);
  });

  it("won't resume while sending is paused on the team", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: new Date(),
    });

    await expect(
      resumeCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Sending is paused");

    expect(mockQueueGetJob).not.toHaveBeenCalled();
    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });

  it("won't resume a campaign the Guard stopped", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      scheduledAt: null,
      guardStoppedAt: new Date(),
    });

    await expect(
      resumeCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Our team is reviewing this campaign");

    expect(mockQueueGetJob).not.toHaveBeenCalled();
    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });

  it("sends a new team's resumed campaign back for the Guard's check", async () => {
    const until = new Date(Date.now() + 10 * 60 * 1000);
    mockReviewHoldFor.mockResolvedValue(until);
    mockQueueGetJob.mockResolvedValue(null);

    await resumeCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(mockTx.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: { status: "RUNNING", reviewHoldUntil: until },
    });
  });

  it("won't resume while the team is blocked", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      isBlocked: true,
      sendingPausedAt: null,
    });

    await expect(
      resumeCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Sending is paused");

    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });

  it("won't resume if the Guard stops it while resuming", async () => {
    mockQueueGetJob.mockResolvedValue(null);
    mockTx.campaign.findUnique.mockResolvedValue({ guardStoppedAt: new Date() });

    await expect(
      resumeCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Our team is reviewing this campaign");
    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });

  it("won't overwrite a pause that lands after the first check", async () => {
    mockQueueGetJob.mockResolvedValue(null);
    mockTx.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: new Date(),
    });

    await expect(
      resumeCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Sending is paused");

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.team.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });

  it("clears a failed batch so the scheduler can continue the campaign", async () => {
    const job = {
      isFailed: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockQueueGetJob.mockResolvedValue(job);

    await resumeCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(mockQueueGetJob).toHaveBeenCalledWith("campaign-batch-campaign_1");
    expect(job.remove).toHaveBeenCalled();
    expect(mockTx.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: { status: "RUNNING", reviewHoldUntil: null },
    });
  });

  it("leaves a batch that is still running alone", async () => {
    const job = {
      isFailed: vi.fn().mockResolvedValue(false),
      remove: vi.fn(),
    };
    mockQueueGetJob.mockResolvedValue(job);

    await resumeCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(job.remove).not.toHaveBeenCalled();
  });

  it("keeps the campaign paused if the failed batch can't be cleared", async () => {
    mockQueueGetJob.mockResolvedValue({
      isFailed: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockRejectedValue(new Error("Job is locked")),
    });

    await expect(
      resumeCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Job is locked");

    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });
});

describe("guardReviewCampaign", () => {
  const updatedAt = new Date("2026-11-22T10:00:00Z");
  const content = {
    from: "news@acme.com",
    replyTo: [],
    subject: "Launch",
    previewText: null,
    html: "<p>Launch</p>",
  };
  const hash = "Launch|<p>Launch</p>";

  function campaign(overrides: Record<string, unknown> = {}) {
    return {
      id: "cmp_1",
      teamId: 7,
      name: "Launch",
      status: "SCHEDULED",
      guardStoppedAt: null,
      reviewHoldUntil: new Date(Date.now() + 5 * 60_000),
      sent: 0,
      team: { createdAt: new Date(), name: "Acme" },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertGuardMayAct.mockImplementation(() => undefined);
    mockDb.campaign.findUnique.mockResolvedValue(campaign());
    mockTx.campaign.findUnique.mockResolvedValue({
      status: "SCHEDULED",
      updatedAt,
      guardStoppedAt: null,
      ...content,
    });
    mockTx.campaign.updateMany.mockResolvedValue({ count: 1 });
    mockTx.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: null,
    });
    mockQueueGetJob.mockResolvedValue(null);
  });

  it("stops a sending campaign, marks it stopped and logs it", async () => {
    const result = await guardReviewCampaign("cmp_1", {
      decision: "stop",
      reason: "bought list",
    });

    expect(result.status).toBe("PAUSED");
    expect(mockAssertGuardMayAct).toHaveBeenCalled();
    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "cmp_1", status: "SCHEDULED" },
      data: {
        status: "PAUSED",
        reviewHoldUntil: null,
        guardStoppedAt: expect.any(Date),
      },
    });
    expect(mockTx.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PAUSE",
        actor: "guard",
        details: {
          scope: "campaign",
          campaignId: "cmp_1",
          source: "guard",
          customerReason: "bought list",
        },
      }),
    });
    expect(mockEmailTeam).toHaveBeenCalledWith(
      7,
      'Your campaign "Launch" is on hold for review',
      expect.stringContaining("Nothing has been sent yet."),
    );
  });

  it("doesn't claim nothing went out if a batch had started", async () => {
    mockTx.campaign.updateMany
      .mockResolvedValueOnce({ count: 0 }) // no longer SCHEDULED
      .mockResolvedValueOnce({ count: 1 }); // stopped while RUNNING

    await guardReviewCampaign("cmp_1", { decision: "stop", reason: "bought list" });

    expect(mockEmailTeam).toHaveBeenCalledWith(
      7,
      expect.any(String),
      expect.stringContaining("Some emails may already have gone out"),
    );
  });

  it("won't stop an established team's campaign unless allowed", async () => {
    mockAssertGuardMayAct.mockImplementation(() => {
      throw new Error("The Guard may only act on teams in their first 14 days");
    });

    await expect(
      guardReviewCampaign("cmp_1", { decision: "stop", reason: "x" }),
    ).rejects.toThrow("first 14 days");
    expect(mockTx.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("can't stop a campaign that isn't sending", async () => {
    mockTx.campaign.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      guardReviewCampaign("cmp_1", { decision: "stop", reason: "x" }),
    ).rejects.toThrow("not sending");
    expect(mockTx.teamAction.create).not.toHaveBeenCalled();
    expect(mockEmailTeam).not.toHaveBeenCalled();
  });

  it("approving lets a waiting campaign send, if its content is what was reviewed", async () => {
    const result = await guardReviewCampaign("cmp_1", {
      decision: "approve",
      reason: "newsletter",
      contentHash: hash,
    });

    expect(result.status).toBe("SCHEDULED");
    expect(mockTx.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "cmp_1", updatedAt },
      data: { reviewHoldUntil: null },
    });
  });

  it("refuses to approve content that changed since the review", async () => {
    await expect(
      guardReviewCampaign("cmp_1", {
        decision: "approve",
        reason: "ok",
        contentHash: "Old|<p>old</p>",
      }),
    ).rejects.toThrow("changed since it was reviewed");
    expect(mockTx.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("refuses if the Guard stopped it after the first read", async () => {
    mockTx.campaign.findUnique.mockResolvedValue({
      status: "PAUSED",
      updatedAt,
      guardStoppedAt: new Date(),
      ...content,
    });

    await expect(
      guardReviewCampaign("cmp_1", {
        decision: "approve",
        reason: "ok",
        contentHash: hash,
      }),
    ).rejects.toThrow("stopped meanwhile");
    expect(mockTx.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when an edit lands during the approval", async () => {
    mockTx.campaign.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      guardReviewCampaign("cmp_1", {
        decision: "approve",
        reason: "ok",
        contentHash: hash,
      }),
    ).rejects.toThrow("changed since it was reviewed");
  });

  it("approving a stopped campaign restarts it and clears an old failed batch", async () => {
    mockDb.campaign.findUnique.mockResolvedValue(
      campaign({ status: "PAUSED", guardStoppedAt: new Date(), reviewHoldUntil: null }),
    );
    mockTx.campaign.findUnique.mockResolvedValue({
      status: "PAUSED",
      updatedAt,
      guardStoppedAt: new Date(),
      ...content,
    });
    const job = {
      isFailed: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockQueueGetJob.mockResolvedValue(job);

    const result = await guardReviewCampaign("cmp_1", {
      decision: "approve",
      reason: "checked with the customer",
      contentHash: hash,
    });

    expect(result.status).toBe("SCHEDULED");
    expect(job.remove).toHaveBeenCalled();
    expect(mockTx.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "cmp_1", updatedAt },
      data: { status: "SCHEDULED", guardStoppedAt: null, reviewHoldUntil: null },
    });
  });

  it("won't restart a stopped campaign while its team is paused", async () => {
    mockDb.campaign.findUnique.mockResolvedValue(
      campaign({ status: "PAUSED", guardStoppedAt: new Date() }),
    );
    mockTx.campaign.findUnique.mockResolvedValue({
      status: "PAUSED",
      updatedAt,
      guardStoppedAt: new Date(),
      ...content,
    });
    mockTx.team.findUnique.mockResolvedValue({
      isBlocked: false,
      sendingPausedAt: new Date(),
    });

    await expect(
      guardReviewCampaign("cmp_1", {
        decision: "approve",
        reason: "ok",
        contentHash: hash,
      }),
    ).rejects.toThrow("resume the team first");
    expect(mockTx.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("has nothing to do for a campaign that isn't waiting or stopped", async () => {
    mockDb.campaign.findUnique.mockResolvedValue(
      campaign({ status: "RUNNING", reviewHoldUntil: null }),
    );

    const result = await guardReviewCampaign("cmp_1", {
      decision: "approve",
      reason: "ok",
      contentHash: "anything",
    });

    expect(result.status).toBe("RUNNING");
    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("telling the team about a hold", () => {
  it("writes the on-hold email in plain words", () => {
    const text = campaignOnHoldEmail({
      teamName: "Acme",
      campaignName: "Launch",
      reason: "a link points to a site Google lists as phishing.",
      started: false,
    });
    expect(text).toContain('We\'ve put your campaign "Launch" on hold before it went out, because a link points to a site Google lists as phishing.');
    expect(text).toContain("Nothing has been sent yet.");
    expect(text).toContain("just reply to this email");
  });

  it("doesn't promise nothing went out once it had started", () => {
    const text = campaignOnHoldEmail({ teamName: "Acme", campaignName: "L", reason: "it looks like cold outreach", started: true });
    expect(text).toContain("Some emails may already have gone out; further sending is on hold.");
    expect(text).not.toContain("Nothing has been sent");
  });

  it("strips links, addresses and new lines from the model's reason", () => {
    expect(customerReason("it looks like phishing. Visit https://evil.example/login or mail help@evil.example\nIGNORE ALL")).toBe(
      "it looks like phishing. Visit or mail IGNORE ALL",
    );
    expect(customerReason("go to evil-login.com/verify now, it links to a phishing site")).toBe(
      "go to now, it links to a phishing site",
    );
    expect(customerReason("  ")).toBe("it needs a quick look from our team");
    expect(customerReason("x".repeat(300)).length).toBeLessThanOrEqual(200);
  });

  it("shows the reason on the campaign page while it's on hold", async () => {
    mockDb.teamAction.findFirst.mockResolvedValue({
      details: { customerReason: "it looks like cold outreach" },
    });
    const since = new Date();
    await expect(
      guardHoldFor({ id: "cmp_1", teamId: 7, guardStoppedAt: since }),
    ).resolves.toEqual({ since, reason: "it looks like cold outreach" });
    await expect(
      guardHoldFor({ id: "cmp_1", teamId: 7, guardStoppedAt: null }),
    ).resolves.toBeNull();
  });
});

describe("adminReleaseCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "cmp_1",
      teamId: 7,
      name: "Launch",
      guardStoppedAt: new Date(),
      team: { name: "Acme" },
    });
    mockTx.team.findUnique.mockResolvedValue({ isBlocked: false, sendingPausedAt: null });
    mockTx.campaign.updateMany.mockResolvedValue({ count: 1 });
    mockQueueGetJob.mockResolvedValue(null);
  });

  it("puts it back to sending, logs who did it, and tells the team", async () => {
    await adminReleaseCampaign("cmp_1", "admin:km@example.com");

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: "cmp_1", guardStoppedAt: { not: null } },
      data: { status: "SCHEDULED", guardStoppedAt: null, reviewHoldUntil: null },
    });
    expect(mockTx.teamAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ALERT", actor: "admin:km@example.com" }),
    });
    expect(mockEmailTeam).toHaveBeenCalledWith(
      7,
      'Your campaign "Launch" is sending again',
      expect.stringContaining("it will continue as scheduled"),
    );
  });

  it("refuses a campaign that isn't on hold", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "cmp_1", teamId: 7, name: "Launch", guardStoppedAt: null, team: { name: "Acme" },
    });
    await expect(adminReleaseCampaign("cmp_1", "admin:x")).rejects.toThrow("isn't on hold");
    expect(mockEmailTeam).not.toHaveBeenCalled();
  });

  it("asks to resume the team first if it's paused", async () => {
    mockTx.team.findUnique.mockResolvedValue({ isBlocked: false, sendingPausedAt: new Date() });
    await expect(adminReleaseCampaign("cmp_1", "admin:x")).rejects.toThrow("resume the team first");
    expect(mockTx.campaign.updateMany).not.toHaveBeenCalled();
    expect(mockEmailTeam).not.toHaveBeenCalled();
  });
});

describe("campaign batch worker, re-running a batch that failed part-way", () => {
  const contacts = ["contact_1", "contact_2", "contact_3"].map((id) => ({
    id,
    email: `${id}@example.com`,
    firstName: null,
    lastName: null,
    properties: {},
    contactBookId: "book_1",
    subscribed: true,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      contactBookId: "book_1",
      domainId: 3,
      status: "RUNNING",
      scheduledAt: null,
      batchSize: 500,
      lastCursor: null,
      content: null,
      html: "<p>Hello</p>",
      from: "news@example.com",
      subject: "Hello",
      replyTo: [],
      cc: [],
      bcc: [],
      previewText: null,
    });
    mockDb.contact.findMany.mockResolvedValue(contacts);
    mockDb.contactBook.findUnique.mockResolvedValue({ variables: [] });
    mockDb.domain.findUnique.mockResolvedValue({ id: 3, region: "us-east-1" });
    // The failed run already emailed contact_1 before it stopped.
    mockDb.campaignEmail.findMany.mockResolvedValue([
      { contactId: "contact_1" },
    ]);
    mockCheckSuppressions.mockResolvedValue({});
    mockDb.email.create.mockImplementation(async ({ data }: any) => ({
      id: `email_${data.contactId}`,
    }));
    mockDb.campaignEmail.create.mockResolvedValue({});
    mockDb.campaign.update.mockResolvedValue({});
    mockQueueEmail.mockResolvedValue(undefined);
  });

  it("doesn't send a campaign that is still waiting for the Guard", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      ...(await mockDb.campaign.findUnique()),
      reviewHoldUntil: new Date(Date.now() + 60_000),
    });

    await capturedBatchHandler.handler({
      data: { campaignId: "campaign_1", teamId: 7 },
    });

    expect(mockDb.contact.findMany).not.toHaveBeenCalled();
    expect(mockQueueEmail).not.toHaveBeenCalled();
  });

  it("doesn't start a campaign the Guard stopped while it was being read", async () => {
    mockDb.campaign.findUnique
      .mockResolvedValueOnce({
        ...(await mockDb.campaign.findUnique()),
        status: "SCHEDULED",
      })
      .mockResolvedValueOnce({ status: "PAUSED", guardStoppedAt: new Date() });
    mockDb.campaign.updateMany.mockResolvedValue({ count: 0 });

    await capturedBatchHandler.handler({
      data: { campaignId: "campaign_1", teamId: 7 },
    });

    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign_1",
        status: "SCHEDULED",
        guardStoppedAt: null,
        OR: [{ reviewHoldUntil: null }, { reviewHoldUntil: { lte: expect.any(Date) } }],
      },
      data: { status: "RUNNING" },
    });
    expect(mockDb.contact.findMany).not.toHaveBeenCalled();
    expect(mockQueueEmail).not.toHaveBeenCalled();
  });

  it("doesn't start a campaign that an edit put back on hold meanwhile", async () => {
    mockDb.campaign.findUnique
      .mockResolvedValueOnce({
        ...(await mockDb.campaign.findUnique()),
        status: "SCHEDULED",
      })
      .mockResolvedValueOnce({
        status: "SCHEDULED",
        guardStoppedAt: null,
        reviewHoldUntil: new Date(Date.now() + 60_000),
      });
    mockDb.campaign.updateMany.mockResolvedValue({ count: 0 });

    await capturedBatchHandler.handler({
      data: { campaignId: "campaign_1", teamId: 7 },
    });

    expect(mockQueueEmail).not.toHaveBeenCalled();
  });

  it("skips a campaign marked stopped by the Guard", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      ...(await mockDb.campaign.findUnique()),
      guardStoppedAt: new Date(),
    });

    await capturedBatchHandler.handler({
      data: { campaignId: "campaign_1", teamId: 7 },
    });

    expect(mockQueueEmail).not.toHaveBeenCalled();
  });

  it("sends anyway once the wait is over", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      ...(await mockDb.campaign.findUnique()),
      reviewHoldUntil: new Date(Date.now() - 1_000),
    });

    await capturedBatchHandler.handler({
      data: { campaignId: "campaign_1", teamId: 7 },
    });

    expect(mockQueueEmail).toHaveBeenCalledTimes(2);
  });

  it("emails only the contacts that weren't emailed yet, once each, then moves on", async () => {
    expect(capturedBatchHandler.handler).toBeTypeOf("function");

    await capturedBatchHandler.handler({
      data: { campaignId: "campaign_1", teamId: 7 },
    });

    expect(mockDb.email.create).toHaveBeenCalledTimes(2);
    expect(
      mockDb.email.create.mock.calls.map(([arg]: any) => arg.data.contactId),
    ).toEqual(["contact_2", "contact_3"]);
    expect(mockQueueEmail).toHaveBeenCalledTimes(2);
    expect(mockQueueEmail.mock.calls.map(([emailId]) => emailId)).toEqual([
      "email_contact_2",
      "email_contact_3",
    ]);
    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: { lastCursor: "contact_3", lastSentAt: expect.any(Date) },
    });
  });

  it("never emails anyone twice when a batch fails after sending and runs again", async () => {
    // A stand-in for the database: remembers which contacts got their email.
    const linked = new Set<string>();
    mockDb.campaignEmail.findMany.mockImplementation(async ({ where }: any) =>
      where.contactId.in
        .filter((id: string) => linked.has(id))
        .map((contactId: string) => ({ contactId })),
    );
    mockDb.campaignEmail.create.mockImplementation(async ({ data }: any) => {
      linked.add(data.contactId);
      return {};
    });
    // The first run fails at the very end, when saving its progress.
    mockDb.campaign.update
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValue({});

    const job = { data: { campaignId: "campaign_1", teamId: 7 } };
    await expect(capturedBatchHandler.handler(job)).rejects.toThrow(
      "connection reset",
    );
    expect(mockQueueEmail).toHaveBeenCalledTimes(3);

    // The retry starts from the same (unsaved) position.
    await capturedBatchHandler.handler(job);

    expect(mockQueueEmail).toHaveBeenCalledTimes(3);
    expect(mockDb.email.create).toHaveBeenCalledTimes(3);
    expect(mockDb.campaign.update).toHaveBeenLastCalledWith({
      where: { id: "campaign_1" },
      data: { lastCursor: "contact_3", lastSentAt: expect.any(Date) },
    });
  });
});

describe("campaign contact subscription changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the contact through the webhook-emitting service on unsubscribe", async () => {
    const contact = {
      id: "contact_1",
      contactBookId: "book_1",
      email: "alice@example.com",
      subscribed: true,
    };
    const updatedContact = { ...contact, subscribed: false };
    mockDb.contact.findUnique.mockResolvedValue(contact);
    mockUpdateContactSubscription.mockResolvedValue(updatedContact);

    const result = await unsubscribeContact({
      contactId: "contact_1",
      campaignId: "campaign_1",
      reason: UnsubscribeReason.UNSUBSCRIBED,
    });

    expect(mockUpdateContactSubscription).toHaveBeenCalledWith({
      contactId: "contact_1",
      subscribed: false,
      unsubscribeReason: UnsubscribeReason.UNSUBSCRIBED,
    });
    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: { unsubscribed: { increment: 1 } },
    });
    expect(result).toBe(updatedContact);
  });

  it("updates the contact through the webhook-emitting service on re-subscribe", async () => {
    mockDb.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      contactBookId: "book_1",
      email: "alice@example.com",
      subscribed: false,
    });
    const id = "contact_1-campaign_1";
    const hash = createHash("sha256").update(`${id}-test-secret`).digest("hex");

    await subscribeContact(id, hash);

    expect(mockUpdateContactSubscription).toHaveBeenCalledWith({
      contactId: "contact_1",
      subscribed: true,
      unsubscribeReason: null,
    });
    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: { unsubscribed: { decrement: 1 } },
    });
  });
});
