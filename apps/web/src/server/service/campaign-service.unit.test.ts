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
      $transaction: vi.fn(async (callback: ReturnType<typeof vi.fn>) =>
        callback(mockTx),
      ),
      contact: {
        findUnique: vi.fn(),
      },
      campaign: {
        update: vi.fn(),
      },
    },
    mockUpdateContactSubscription: vi.fn(),
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
    add = vi.fn();
  },
  Worker: class {},
}));

vi.mock("~/server/redis", () => ({
  getRedis: vi.fn(() => ({})),
  BULL_PREFIX: "test",
}));

vi.mock("~/server/service/email-queue-service", () => ({
  EmailQueueService: {},
}));

vi.mock("~/server/queue/bullmq-context", () => ({
  createWorkerHandler: vi.fn((handler) => handler),
}));

vi.mock("~/server/service/suppression-service", () => ({
  SuppressionService: {},
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
  recordCampaignContactFailure,
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
