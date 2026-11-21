import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { UnsubscribeReason } from "@prisma/client";

const { mockDb, mockTx, mockUpdateContactSubscription } = vi.hoisted(() => {
  const mockTx = {
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
} = vi.hoisted(() => ({
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
    mockDb.campaign.update.mockResolvedValue({});
  });

  it("clears a batch that failed long ago, so the campaign isn't paused again", async () => {
    const job = {
      isFailed: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockQueueGetJob.mockResolvedValue(job);

    await scheduleCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(job.remove).toHaveBeenCalled();
    expect(mockDb.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "campaign_1" },
        data: expect.objectContaining({ status: "SCHEDULED" }),
      }),
    );
    // The new schedule is saved before the failed batch is cleared, so the
    // scheduler can't start an early batch in between.
    expect(mockDb.campaign.update.mock.invocationCallOrder[0]).toBeLessThan(
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
    mockDb.campaign.update.mockResolvedValue({});
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
    expect(mockDb.campaign.update).not.toHaveBeenCalled();
  });

  it("won't resume while the team is blocked", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      isBlocked: true,
      sendingPausedAt: null,
    });

    await expect(
      resumeCampaign({ campaignId: "campaign_1", teamId: 7 }),
    ).rejects.toThrow("Sending is paused");

    expect(mockDb.campaign.update).not.toHaveBeenCalled();
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
    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: { status: "RUNNING" },
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

    expect(mockDb.campaign.update).not.toHaveBeenCalled();
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
