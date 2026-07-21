import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { UnsubscribeReason } from "@prisma/client";

const {
  mockDb,
  mockTx,
  mockQueueAdd,
  mockQueueEmail,
  mockUpdateContactSubscription,
  mockValidateDomainFromEmail,
} = vi.hoisted(() => {
  const mockTx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    campaignEmail: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    campaign: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    email: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
      $transaction: vi.fn(async (callback: ReturnType<typeof vi.fn>) =>
        callback(mockTx),
      ),
      contact: {
        count: vi.fn(),
        findUnique: vi.fn(),
      },
      contactBook: {
        findUnique: vi.fn(),
      },
      campaign: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      campaignEmail: {
        updateMany: vi.fn(),
      },
    },
    mockQueueAdd: vi.fn(),
    mockQueueEmail: vi.fn(),
    mockUpdateContactSubscription: vi.fn(),
    mockValidateDomainFromEmail: vi.fn(),
  };
});

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
  },
  Worker: class {},
}));

vi.mock("~/server/redis", () => ({
  getRedis: vi.fn(() => ({})),
  BULL_PREFIX: "test",
}));

vi.mock("~/server/service/email-queue-service", () => ({
  EmailQueueService: {
    queueEmail: mockQueueEmail,
  },
}));

vi.mock("~/server/queue/bullmq-context", () => ({
  createWorkerHandler: vi.fn((handler) => handler),
}));

vi.mock("~/server/service/suppression-service", () => ({
  SuppressionService: {},
}));

vi.mock("~/server/service/domain-service", () => ({
  validateApiKeyDomainAccess: vi.fn(),
  validateDomainFromEmail: mockValidateDomainFromEmail,
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
  claimCampaignRecipients,
  createCampaignFromApi,
  pauseCampaign,
  prepareCampaignAudience,
  queueClaimedCampaignEmail,
  recordCampaignContactFailure,
  resumeCampaign,
  scheduleCampaign,
  startCampaignIfDue,
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
    expect(mockTx.campaignEmail.update).toHaveBeenCalledWith({
      where: {
        campaignId_contactId: {
          campaignId: "campaign_1",
          contactId: "contact_1",
        },
      },
      data: { status: "FAILED", processedAt: expect.any(Date) },
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
    expect(mockTx.campaignEmail.upsert).toHaveBeenCalledWith({
      where: {
        campaignId_contactId: {
          campaignId: "campaign_1",
          contactId: "contact_1",
        },
      },
      create: {
        campaignId: "campaign_1",
        contactId: "contact_1",
        emailId: "email_2",
        status: "FAILED",
        processedAt: expect.any(Date),
      },
      update: {
        emailId: "email_2",
        status: "FAILED",
        processedAt: expect.any(Date),
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
    expect(mockTx.campaignEmail.upsert).toHaveBeenCalledWith({
      where: {
        campaignId_contactId: {
          campaignId: "campaign_1",
          contactId: "contact_1",
        },
      },
      create: {
        campaignId: "campaign_1",
        contactId: "contact_1",
        emailId: "email_3",
        status: "FAILED",
        processedAt: expect.any(Date),
      },
      update: {
        emailId: "email_3",
        status: "FAILED",
        processedAt: expect.any(Date),
      },
    });
    expect(mockTx.email.update).toHaveBeenCalledWith({
      where: { id: "email_3" },
      data: { latestStatus: "FAILED" },
    });
  });

  it("does not overwrite a recipient after its processing claim is replaced", async () => {
    const originalClaim = new Date("2026-07-21T09:00:00.000Z");
    mockTx.campaignEmail.findUnique.mockResolvedValue({
      emailId: "email_1",
      status: "PROCESSING",
      processedAt: new Date("2026-07-21T10:30:00.000Z"),
    });

    await recordCampaignContactFailure({
      ...input,
      claimProcessedAt: originalClaim,
    });

    expect(mockTx.campaignEmail.updateMany).not.toHaveBeenCalled();
    expect(mockTx.email.update).not.toHaveBeenCalled();
    expect(mockTx.emailEvent.create).not.toHaveBeenCalled();
  });
});

describe("queueClaimedCampaignEmail", () => {
  const claimProcessedAt = new Date("2026-07-21T09:00:00.000Z");
  const queueInput = {
    campaignId: "campaign_1",
    contactId: "contact_1",
    claimProcessedAt,
    teamId: 7,
    region: "us-east-1",
    oneClickUnsubUrl: "https://example.com/unsubscribe",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves an accepted queue job recoverable when bookkeeping fails", async () => {
    mockQueueEmail.mockResolvedValue(undefined);
    mockDb.campaignEmail.updateMany.mockRejectedValue(
      new Error("database unavailable"),
    );

    const result = await queueClaimedCampaignEmail({
      ...queueInput,
      email: {
        id: "email_1",
        latestStatus: "QUEUED",
        sesEmailId: null,
      },
    });

    expect(mockQueueEmail).toHaveBeenCalledWith(
      "email_1",
      7,
      "us-east-1",
      false,
      "https://example.com/unsubscribe",
    );
    expect(result).toEqual({ recoveryPending: true });
  });

  it("does not requeue an email that already has an SES message ID", async () => {
    mockDb.campaignEmail.updateMany.mockResolvedValue({ count: 1 });

    const result = await queueClaimedCampaignEmail({
      ...queueInput,
      email: {
        id: "email_1",
        latestStatus: "QUEUED",
        sesEmailId: "ses-message-1",
      },
    });

    expect(mockQueueEmail).not.toHaveBeenCalled();
    expect(mockDb.campaignEmail.updateMany).toHaveBeenCalledWith({
      where: {
        campaignId: "campaign_1",
        contactId: "contact_1",
        status: "PROCESSING",
        processedAt: claimProcessedAt,
        emailId: "email_1",
      },
      data: {
        status: "QUEUED",
        processedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({ recoveryPending: false });
  });

  it("propagates a real queue rejection so the caller can record failure", async () => {
    mockQueueEmail.mockRejectedValue(new Error("redis unavailable"));

    await expect(
      queueClaimedCampaignEmail({
        ...queueInput,
        email: {
          id: "email_1",
          latestStatus: "QUEUED",
          sesEmailId: null,
        },
      }),
    ).rejects.toThrow("redis unavailable");

    expect(mockDb.campaignEmail.updateMany).not.toHaveBeenCalled();
  });
});

describe("campaign delivery lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores gradual settings on API-created drafts", async () => {
    mockDb.contactBook.findUnique.mockResolvedValue({ id: "book_1" });
    mockValidateDomainFromEmail.mockResolvedValue({ id: 11 });
    mockDb.campaign.create.mockResolvedValue({ id: "campaign_1" });

    await createCampaignFromApi({
      teamId: 7,
      name: "Launch",
      from: "sender@example.com",
      subject: "Hello",
      html: '<a href="{{usesend_unsubscribe_url}}">Unsubscribe</a>',
      contactBookId: "book_1",
      delivery: {
        strategy: "GRADUAL",
        batchPercentage: 10,
        interval: "hour",
      },
    });

    expect(mockDb.campaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliveryMode: "GRADUAL",
        deliveryBatchPercentage: 10,
        deliveryIntervalMinutes: 60,
        deliveryBatchSize: null,
      }),
    });
  });

  it("does not allow delivery settings to change after sending starts", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      status: "RUNNING",
    });

    await expect(
      scheduleCampaign({
        campaignId: "campaign_1",
        teamId: 7,
        delivery: {
          strategy: "GRADUAL",
          batchPercentage: 10,
          interval: "hour",
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Delivery settings cannot be changed after a campaign has started",
    });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("requires a completed campaign to be duplicated before sending again", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      status: "SENT",
    });

    await expect(
      scheduleCampaign({
        campaignId: "campaign_1",
        teamId: 7,
        scheduledAt: new Date("2026-07-22T09:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Completed campaigns cannot be scheduled again. Duplicate the campaign to send it again",
    });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("does not clear recipient claims if the campaign starts concurrently", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      status: "SCHEDULED",
      content: null,
      html: '<a href="{{usesend_unsubscribe_url}}">Unsubscribe</a>',
      contactBookId: "book_1",
      scheduledAt: new Date("2026-07-22T09:00:00.000Z"),
      deliveryMode: "ALL_AT_ONCE",
      deliveryBatchPercentage: null,
      deliveryIntervalMinutes: null,
    });
    mockDb.contact.count.mockResolvedValue(100);
    mockTx.$queryRaw.mockResolvedValue([{ status: "RUNNING" }]);

    await expect(
      scheduleCampaign({
        campaignId: "campaign_1",
        teamId: 7,
        scheduledAt: new Date("2026-07-23T09:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Delivery settings cannot be changed after a campaign has started",
    });

    expect(mockTx.campaignEmail.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.campaign.update).not.toHaveBeenCalled();
  });

  it("starts a campaign only while it is still scheduled and due", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const runningCampaign = {
      id: "campaign_1",
      status: "RUNNING",
    };
    mockDb.campaign.updateMany.mockResolvedValue({ count: 1 });
    mockDb.campaign.findUnique.mockResolvedValue(runningCampaign);

    const result = await startCampaignIfDue("campaign_1", now);

    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign_1",
        status: "SCHEDULED",
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      data: { status: "RUNNING" },
    });
    expect(result).toBe(runningCampaign);
  });

  it("leaves a concurrently rescheduled campaign untouched", async () => {
    mockDb.campaign.updateMany.mockResolvedValue({ count: 0 });

    const result = await startCampaignIfDue(
      "campaign_1",
      new Date("2026-07-21T09:00:00.000Z"),
    );

    expect(result).toBeNull();
    expect(mockDb.campaign.findUnique).not.toHaveBeenCalled();
  });

  it("moves the next wave by the paused duration when resuming", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      status: "PAUSED",
      scheduledAt: new Date("2026-07-21T09:00:00.000Z"),
      pausedAt: new Date("2026-07-21T10:00:00.000Z"),
      nextDeliveryAt: new Date("2026-07-21T10:30:00.000Z"),
    });

    await resumeCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(mockDb.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: {
        status: "RUNNING",
        pausedAt: null,
        nextDeliveryAt: new Date("2026-07-21T12:30:00.000Z"),
      },
    });
  });

  it("keeps the original pause timestamp when pause is retried", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      status: "PAUSED",
      pausedAt: new Date("2026-07-21T10:00:00.000Z"),
    });

    await pauseCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(mockDb.campaign.updateMany).not.toHaveBeenCalled();
  });

  it("atomically transitions an active campaign to paused", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T10:00:00.000Z"));
    mockDb.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      teamId: 7,
      status: "RUNNING",
    });
    mockDb.campaign.updateMany.mockResolvedValue({ count: 1 });

    await pauseCampaign({ campaignId: "campaign_1", teamId: 7 });

    expect(mockDb.campaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: "campaign_1",
        teamId: 7,
        status: "RUNNING",
      },
      data: {
        status: "PAUSED",
        pausedAt: new Date("2026-07-21T10:00:00.000Z"),
      },
    });
  });

  it("captures the audience with one database snapshot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T09:00:00.000Z"));
    const campaign = {
      id: "campaign_1",
      contactBookId: "book_1",
      audienceCapturedAt: null,
      audiencePreparedAt: null,
      deliveryMode: "GRADUAL",
      deliveryBatchPercentage: 10,
      deliveryIntervalMinutes: 60,
      scheduledAt: new Date("2026-07-21T09:00:00.000Z"),
    } as any;
    mockTx.campaign.findUnique.mockResolvedValue(campaign);
    mockTx.$executeRaw.mockResolvedValue(2);
    mockTx.campaignEmail.count.mockResolvedValue(2);
    mockTx.campaign.update.mockResolvedValue(campaign);

    await prepareCampaignAudience(campaign);

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockTx.$executeRaw.mock.calls[0]?.slice(1)).toEqual([
      "campaign_1",
      "book_1",
      new Date("2026-07-21T09:00:00.000Z"),
    ]);
    expect(mockTx.campaignEmail.count).toHaveBeenCalledWith({
      where: { campaignId: "campaign_1" },
    });
    expect(mockTx.campaign.update).toHaveBeenLastCalledWith({
      where: { id: "campaign_1" },
      data: {
        total: 2,
        audienceCapturedAt: new Date("2026-07-21T09:00:00.000Z"),
        audiencePreparedAt: expect.any(Date),
        deliveryBatchSize: 1,
      },
    });
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      timeout: 30 * 60 * 1000,
    });
  });

  it("queues campaign batches with a BullMQ-compatible job ID", async () => {
    mockDb.campaign.findUnique.mockResolvedValue({
      status: "SCHEDULED",
      lastSentAt: null,
      batchWindowMinutes: 0,
      total: 23,
      deliveryMode: "GRADUAL",
      deliveryBatchSize: 12,
      currentDeliveryBatch: 0,
      deliveryBatchProcessed: 0,
      nextDeliveryAt: null,
    });

    await CampaignBatchService.queueBatch({
      campaignId: "campaign_1",
      teamId: 7,
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "campaign-campaign_1",
      { campaignId: "campaign_1", teamId: 7 },
      expect.objectContaining({
        jobId: "campaign-batch-campaign_1",
        removeOnFail: true,
      }),
    );
  });

  it("claims gradual wave capacity in the recipient transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T09:00:00.000Z"));

    const campaign = {
      id: "campaign_1",
      status: "RUNNING",
      deliveryMode: "GRADUAL",
      deliveryBatchSize: 2,
      deliveryIntervalMinutes: 60,
      currentDeliveryBatch: 0,
      deliveryBatchProcessed: 0,
      total: 5,
      batchSize: 500,
    };
    const firstWaveCampaign = {
      ...campaign,
      currentDeliveryBatch: 1,
      nextDeliveryAt: null,
    };
    const claimedCampaign = {
      ...firstWaveCampaign,
      deliveryBatchProcessed: 2,
      nextDeliveryAt: new Date("2026-07-21T10:00:00.000Z"),
    };

    mockTx.$queryRaw.mockResolvedValue([{ id: "campaign_1" }]);
    mockTx.campaign.findUnique.mockResolvedValue(campaign);
    mockTx.campaign.update
      .mockResolvedValueOnce(firstWaveCampaign)
      .mockResolvedValueOnce(claimedCampaign);
    mockTx.campaignEmail.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { contactId: "contact_1" },
        { contactId: "contact_2" },
      ])
      .mockResolvedValueOnce([
        { contactId: "contact_1" },
        { contactId: "contact_2" },
      ]);
    mockTx.campaignEmail.count.mockResolvedValue(0);
    mockTx.campaignEmail.updateMany.mockResolvedValue({ count: 2 });

    const result = await claimCampaignRecipients("campaign_1");

    expect(result.recipients).toEqual([
      {
        contactId: "contact_1",
        claimProcessedAt: new Date("2026-07-21T09:00:00.000Z"),
      },
      {
        contactId: "contact_2",
        claimProcessedAt: new Date("2026-07-21T09:00:00.000Z"),
      },
    ]);
    expect(mockTx.campaignEmail.updateMany).toHaveBeenCalledWith({
      where: {
        campaignId: "campaign_1",
        contactId: { in: ["contact_1", "contact_2"] },
        status: "PENDING",
      },
      data: {
        status: "PROCESSING",
        processedAt: new Date("2026-07-21T09:00:00.000Z"),
      },
    });
    expect(mockTx.campaign.update).toHaveBeenLastCalledWith({
      where: { id: "campaign_1" },
      data: {
        deliveryBatchProcessed: { increment: 2 },
        nextDeliveryAt: new Date("2026-07-21T10:00:00.000Z"),
      },
    });
  });

  it("keeps the next delivery unset until the whole wave is claimed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T09:00:00.000Z"));

    const campaign = {
      id: "campaign_1",
      status: "RUNNING",
      deliveryMode: "GRADUAL",
      deliveryBatchSize: 1_000,
      deliveryIntervalMinutes: 60,
      currentDeliveryBatch: 1,
      deliveryBatchProcessed: 0,
      nextDeliveryAt: null,
      total: 2_000,
      batchSize: 500,
    };
    const recipients = Array.from({ length: 500 }, (_, index) => ({
      contactId: `contact_${index}`,
    }));

    mockTx.$queryRaw.mockResolvedValue([{ id: "campaign_1" }]);
    mockTx.campaign.findUnique.mockResolvedValue(campaign);
    mockTx.campaign.update.mockResolvedValue({
      ...campaign,
      deliveryBatchProcessed: 500,
    });
    mockTx.campaignEmail.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(recipients)
      .mockResolvedValueOnce(recipients);
    mockTx.campaignEmail.count.mockResolvedValue(0);
    mockTx.campaignEmail.updateMany.mockResolvedValue({ count: 500 });

    await claimCampaignRecipients("campaign_1");

    expect(mockTx.campaign.update).toHaveBeenCalledWith({
      where: { id: "campaign_1" },
      data: {
        deliveryBatchProcessed: { increment: 500 },
      },
    });
  });

  it("reclaims stale recipients without consuming wave capacity twice", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));

    mockTx.$queryRaw.mockResolvedValue([{ id: "campaign_1" }]);
    mockTx.campaign.findUnique.mockResolvedValue({
      id: "campaign_1",
      status: "RUNNING",
      deliveryMode: "GRADUAL",
      deliveryBatchSize: 10,
      deliveryIntervalMinutes: 60,
      currentDeliveryBatch: 1,
      deliveryBatchProcessed: 5,
      total: 100,
      batchSize: 500,
    });
    mockTx.campaignEmail.findMany
      .mockResolvedValueOnce([{ contactId: "contact_1" }])
      .mockResolvedValueOnce([{ contactId: "contact_1" }]);
    mockTx.campaignEmail.updateMany.mockResolvedValue({ count: 1 });

    const result = await claimCampaignRecipients("campaign_1");

    expect(result.recipients).toEqual([
      {
        contactId: "contact_1",
        claimProcessedAt: new Date("2026-07-21T12:00:00.000Z"),
      },
    ]);
    expect(mockTx.campaign.update).not.toHaveBeenCalled();
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
