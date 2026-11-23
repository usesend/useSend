import { EmailStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SesEvent } from "~/types/aws-types";

const {
  mockDb,
  mockUpdateCampaignAnalytics,
  mockWebhookEmit,
  mockCheckSendingHealth,
  mockClaimOutcome,
  mockReleaseOutcome,
} = vi.hoisted(() => ({
  mockReleaseOutcome: vi.fn(),
  mockCheckSendingHealth: vi.fn(),
  mockClaimOutcome: vi.fn(),
  mockDb: {
    $executeRaw: vi.fn(),
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    email: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    dailyEmailUsage: {
      upsert: vi.fn(),
    },
    cumulatedMetrics: {
      upsert: vi.fn(),
    },
  },
  mockUpdateCampaignAnalytics: vi.fn(),
  mockWebhookEmit: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/env", () => ({
  env: {
    NEXTAUTH_URL: "https://usesend.example",
  },
}));

vi.mock("~/server/service/campaign-service", () => ({
  unsubscribeContact: vi.fn(),
  updateCampaignAnalytics: mockUpdateCampaignAnalytics,
}));

vi.mock("~/server/service/webhook-service", () => ({
  WebhookService: {
    emit: mockWebhookEmit,
  },
}));

vi.mock("~/server/service/ses-outcome-claims", () => ({
  claimOutcome: mockClaimOutcome,
  releaseOutcome: mockReleaseOutcome,
}));

vi.mock("~/server/service/sending-rules-service", () => ({
  checkSendingHealth: mockCheckSendingHealth,
}));

vi.mock("~/server/service/suppression-service", () => ({
  SuppressionService: {
    addSuppression: vi.fn(),
  },
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = vi.fn();
  },
  Worker: class {},
}));

vi.mock("~/server/redis", () => ({
  BULL_PREFIX: "test",
  getRedis: vi.fn(() => ({})),
}));

vi.mock("~/server/logger/log", () => ({
  getChildLogger: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    setBindings: vi.fn(),
    warn: vi.fn(),
  },
  withLogger: vi.fn(),
}));

import { parseSesHook } from "~/server/service/ses-hook-parser";

const email = {
  id: "email_1",
  sesEmailId: "ses_1",
  from: "sender@example.com",
  to: ["recipient@example.com"],
  replyTo: [],
  cc: [],
  bcc: [],
  subject: "Hello",
  text: null,
  html: null,
  latestStatus: EmailStatus.DELIVERED,
  teamId: 7,
  domainId: 11,
  apiId: null,
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
  updatedAt: new Date("2026-07-13T00:00:00.000Z"),
  scheduledAt: null,
  attachments: null,
  campaignId: null,
  contactId: null,
  inReplyToId: null,
  headers: null,
};

function buildEvent(eventType: "Open" | "Click"): SesEvent {
  const event = {
    eventType,
    mail: {
      timestamp: "2026-07-13T01:00:00.000Z",
      source: "sender@example.com",
      messageId: "ses_1",
      destination: ["recipient@example.com"],
      headersTruncated: false,
      headers: [],
      commonHeaders: {
        from: ["sender@example.com"],
        to: ["recipient@example.com"],
        messageId: "message_1",
      },
      tags: {},
    },
  } as SesEvent;

  if (eventType === "Open") {
    event.open = {
      ipAddress: "192.0.2.1",
      timestamp: "2026-07-13T01:00:00.000Z",
      userAgent: "test-agent",
    };
  } else {
    event.click = {
      ipAddress: "192.0.2.1",
      timestamp: "2026-07-13T01:00:00.000Z",
      userAgent: "test-agent",
      link: "https://example.com",
      linkTags: {},
    };
  }

  return event;
}

describe("parseSesHook dashboard engagement usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.email.findUnique.mockResolvedValue(email);
    mockDb.emailEvent.create.mockResolvedValue({});
    mockDb.dailyEmailUsage.upsert.mockResolvedValue({});
    mockWebhookEmit.mockResolvedValue(undefined);
  });

  it.each([
    ["Open", EmailStatus.OPENED],
    ["Click", EmailStatus.CLICKED],
  ] as const)(
    "counts only the first %s event for an email",
    async (eventType, status) => {
      mockDb.emailEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "existing_event", status });

      const event = buildEvent(eventType);
      await parseSesHook(event);
      await parseSesHook(event);

      expect(mockDb.emailEvent.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          emailId: email.id,
          status,
        },
      });
      expect(mockDb.dailyEmailUsage.upsert).toHaveBeenCalledTimes(1);
      expect(mockDb.dailyEmailUsage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            [status.toLowerCase()]: {
              increment: 1,
            },
          },
        }),
      );
      expect(mockDb.emailEvent.create).toHaveBeenCalledTimes(2);
    },
  );
});

describe("parseSesHook sending rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.email.findUnique.mockResolvedValue(email);
    mockDb.emailEvent.findFirst.mockResolvedValue(null);
    mockDb.emailEvent.create.mockResolvedValue({});
    mockDb.dailyEmailUsage.upsert.mockResolvedValue({});
    mockDb.cumulatedMetrics.upsert.mockResolvedValue({});
    mockWebhookEmit.mockResolvedValue(undefined);
    mockClaimOutcome.mockResolvedValue("claimed");
  });

  function bounceEvent(
    diagnosticCode: string,
    bounceSubType = "General",
  ): SesEvent {
    const event = buildEvent("Open");
    delete event.open;
    event.eventType = "Bounce";
    event.bounce = {
      bounceType: "Permanent",
      bounceSubType,
      bouncedRecipients: [
        { emailAddress: "recipient@example.com", diagnosticCode },
      ],
      timestamp: "2026-07-13T01:00:00.000Z",
      feedbackId: "feedback_1",
    } as SesEvent["bounce"];
    return event;
  }

  it("checks the team's sending health after a hard bounce", async () => {
    await parseSesHook(bounceEvent("550 5.1.1 user unknown"));

    expect(mockCheckSendingHealth).toHaveBeenCalledWith({
      teamId: 7,
      campaignId: null,
      spamTrap: false,
    });
  });

  it("flags spam trap bounces", async () => {
    await parseSesHook(bounceEvent("550 spamtrap hit"));

    expect(mockCheckSendingHealth).toHaveBeenCalledWith(
      expect.objectContaining({ spamTrap: true }),
    );
  });

  it("keeps processing the event if the check fails", async () => {
    mockCheckSendingHealth.mockRejectedValue(new Error("db down"));

    await parseSesHook(bounceEvent("550 5.1.1 user unknown"));

    expect(mockDb.emailEvent.create).toHaveBeenCalled();
  });

  it("checks the rules after the usage counters include the bounce", async () => {
    await parseSesHook(bounceEvent("550 5.1.1 user unknown"));

    expect(mockClaimOutcome).toHaveBeenCalledWith(email.id, "hardBounced");
    expect(mockDb.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockCheckSendingHealth.mock.invocationCallOrder[0]!,
    );
  });

  it("doesn't count a send to an address on the SES suppression list, like AWS", async () => {
    await parseSesHook(
      bounceEvent("Amazon SES did not send", "OnAccountSuppressionList"),
    );

    expect(mockClaimOutcome).toHaveBeenCalledWith(email.id, "suppressedBounce");
    expect(mockCheckSendingHealth).not.toHaveBeenCalled();
    const usage = mockDb.dailyEmailUsage.upsert.mock.calls[0]?.[0];
    expect(usage.create.hardBounced).toBe(0);
    expect(usage.update).not.toHaveProperty("hardBounced");
    // Still a bounce on the dashboard, just not a hard one.
    expect(usage.update.bounced).toEqual({ increment: 1 });
  });

  it("counts a repeated suppression-list bounce only once", async () => {
    mockClaimOutcome.mockResolvedValue("duplicate");

    await parseSesHook(
      bounceEvent("Amazon SES did not send", "OnAccountSuppressionList"),
    );

    expect(mockDb.dailyEmailUsage.upsert).not.toHaveBeenCalled();
    expect(mockCheckSendingHealth).not.toHaveBeenCalled();
  });

  it("counts a repeated hard bounce only once", async () => {
    mockClaimOutcome.mockResolvedValue("duplicate");

    await parseSesHook(bounceEvent("550 5.1.1 user unknown"));

    expect(mockDb.dailyEmailUsage.upsert).not.toHaveBeenCalled();
    expect(mockCheckSendingHealth).not.toHaveBeenCalled();
    expect(mockDb.emailEvent.create).toHaveBeenCalled();
  });

  it("still updates dashboards when Redis can't check for duplicates", async () => {
    mockClaimOutcome.mockResolvedValue("unavailable");

    await parseSesHook(bounceEvent("550 5.1.1 user unknown"));

    expect(mockDb.dailyEmailUsage.upsert).toHaveBeenCalled();
    expect(mockCheckSendingHealth).not.toHaveBeenCalled();
  });

  it("writes both usage counters in one transaction", async () => {
    await parseSesHook(bounceEvent("550 5.1.1 user unknown"));

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.$transaction.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("gives the claim back if saving the counts fails, so a replay counts it", async () => {
    mockDb.dailyEmailUsage.upsert.mockRejectedValue(new Error("db busy"));

    await expect(
      parseSesHook(bounceEvent("550 5.1.1 user unknown")),
    ).rejects.toThrow("db busy");

    expect(mockReleaseOutcome).toHaveBeenCalledWith(email.id, "hardBounced");
  });

  it("doesn't run on opens", async () => {
    mockDb.emailEvent.findFirst.mockResolvedValue(null);
    await parseSesHook(buildEvent("Open"));

    expect(mockCheckSendingHealth).not.toHaveBeenCalled();
  });
});
